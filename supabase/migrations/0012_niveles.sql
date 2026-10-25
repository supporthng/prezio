-- =====================================================================
-- Prezio · 0012 · Niveles de acceso: plantillas de permisos (Administrador, Gerente de sucursal, Cajero…).
-- Ejecutar en Supabase › SQL Editor DESPUÉS de 0011. Idempotente.
--
-- - Cada negocio nace con niveles básicos y puede crear los suyos.
-- - Al crear o cambiar un usuario se elige su nivel (y, si el nivel es «por sucursal», en cuáles); las casillas
--   salen del nivel. También se puede seguir marcando casillas a mano («Personalizado»).
-- - Cambiar las casillas de un nivel cambia a todas las personas que lo tienen.
-- =====================================================================

create table if not exists public.niveles (
    id uuid primary key default gen_random_uuid(),
    negocio_id uuid not null references public.negocios(id) on delete cascade,
    nombre text not null check (length(btrim(nombre)) between 2 and 40),
    descripcion text check (length(descripcion) <= 140),
    permisos text[] not null default '{}'
        check (permisos <@ array['reportes', 'inventarios', 'sucursales', 'equipos', 'apariencia', 'usuarios']),
    por_sucursal boolean not null default false,    -- al asignarlo se eligen sucursales
    orden integer not null default 100,
    creado timestamptz not null default now()
);
create unique index if not exists niveles_nombre_idx on public.niveles (negocio_id, lower(nombre));
alter table public.niveles enable row level security;
revoke all on public.niveles from anon, authenticated;
grant select on public.niveles to authenticated;
drop policy if exists niveles_ver on public.niveles;
create policy niveles_ver on public.niveles for select to authenticated using (public.es_miembro(negocio_id));

alter table public.miembros add column if not exists nivel_id uuid references public.niveles(id) on delete set null;

-- Los niveles con los que nace cada negocio.
create or replace function public.crear_niveles_base(p_negocio uuid)
returns void language sql security definer set search_path = '' as $$
    insert into public.niveles (negocio_id, nombre, descripcion, permisos, por_sucursal, orden) values
        (p_negocio, 'Administrador', 'Todo el negocio, también usuarios y permisos.',
            array['reportes', 'inventarios', 'sucursales', 'equipos', 'apariencia', 'usuarios'], false, 10),
        (p_negocio, 'Gerente de sucursal', 'Precios, equipos y reportes de su sucursal.',
            array['reportes', 'inventarios', 'sucursales', 'equipos'], true, 20),
        (p_negocio, 'Encargado de precios', 'Carga y revisa los precios; ve los reportes.',
            array['inventarios', 'reportes'], false, 30),
        (p_negocio, 'Técnico de equipos', 'Vincula, mueve y quita verificadores.',
            array['equipos'], true, 40),
        (p_negocio, 'Supervisor', 'Solo mira los reportes de consultas.',
            array['reportes'], false, 50),
        (p_negocio, 'Cajero', 'Solo usa el verificador en línea.',
            array[]::text[], true, 60)
    on conflict do nothing
$$;

create or replace function public.niveles_al_crear_negocio()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    perform public.crear_niveles_base(new.id);
    return new;
end $$;
drop trigger if exists negocios_niveles on public.negocios;
create trigger negocios_niveles after insert on public.negocios for each row execute function public.niveles_al_crear_negocio();

-- Los negocios que ya existían reciben los niveles básicos (una sola vez: solo si no tienen ninguno).
do $$
declare
    n record;
begin
    for n in select id from public.negocios x where not exists (select 1 from public.niveles v where v.negocio_id = x.id) loop
        perform public.crear_niveles_base(n.id);
    end loop;
end $$;

-- ¿Puede quien llama crear, cambiar o borrar niveles? El dueño, o quien tiene «Usuarios» en todo el negocio
-- (y solo con las casillas que él mismo puede dar).
create or replace function public.guardar_nivel(p_negocio uuid, p_nivel uuid, p_nombre text, p_descripcion text,
                                                p_permisos text[], p_por_sucursal boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    v_permisos text[] := array(select distinct x from unnest(coalesce(p_permisos, '{}')) x order by 1);
    v_id uuid := p_nivel;
begin
    if not public.puede(p_negocio, 'usuarios') or not public.puede_dar(p_negocio, v_permisos, null) then
        raise exception 'No puedes crear niveles con esas casillas' using errcode = '42501';
    end if;
    if length(btrim(coalesce(p_nombre, ''))) < 2 then
        raise exception 'Ponle un nombre al nivel' using errcode = '22023';
    end if;
    if exists (select 1 from public.niveles where negocio_id = p_negocio and lower(nombre) = lower(btrim(p_nombre))
               and id is distinct from p_nivel) then
        raise exception 'Ya hay un nivel con ese nombre' using errcode = '23505';
    end if;
    if v_id is null then
        insert into public.niveles (negocio_id, nombre, descripcion, permisos, por_sucursal, orden)
        values (p_negocio, left(btrim(p_nombre), 40), nullif(left(btrim(coalesce(p_descripcion, '')), 140), ''), v_permisos,
                coalesce(p_por_sucursal, false),
                coalesce((select max(orden) from public.niveles where negocio_id = p_negocio), 0) + 10)
        returning id into v_id;
    else
        -- Para cambiarlo, también debe poder dar lo que el nivel tenía.
        if not exists (select 1 from public.niveles where id = v_id and negocio_id = p_negocio) then
            raise exception 'Ese nivel no es de este negocio' using errcode = '22023';
        end if;
        if not public.puede_dar(p_negocio, (select permisos from public.niveles where id = v_id), null) then
            raise exception 'No puedes cambiar ese nivel' using errcode = '42501';
        end if;
        update public.niveles set nombre = left(btrim(p_nombre), 40),
            descripcion = nullif(left(btrim(coalesce(p_descripcion, '')), 140), ''), permisos = v_permisos,
            por_sucursal = coalesce(p_por_sucursal, false)
        where id = v_id;
        -- Todas las personas con este nivel toman las casillas nuevas.
        update public.miembros set permisos = v_permisos,
            rol = case when sucursales is null and v_permisos @> public.permisos_de_rol('admin') then 'admin'::public.rol_negocio
                       else 'verificador'::public.rol_negocio end
        where nivel_id = v_id and rol <> 'dueno';
    end if;
    return v_id;
end $$;

create or replace function public.borrar_nivel(p_nivel uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
    v public.niveles;
begin
    select * into v from public.niveles where id = p_nivel;
    if v.id is null or not public.puede(v.negocio_id, 'usuarios') or not public.puede_dar(v.negocio_id, v.permisos, null) then
        raise exception 'No puedes borrar ese nivel' using errcode = '42501';
    end if;
    delete from public.niveles where id = p_nivel;   -- quienes lo tenían conservan sus casillas («Personalizado»)
end $$;

-- Dar acceso a una persona: con un nivel (las casillas salen de él) o a mano (p_nivel = null).
create or replace function public.cambiar_acceso(p_negocio uuid, p_usuario uuid, p_nivel uuid, p_permisos text[],
                                                 p_sucursales uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
    v public.niveles;
begin
    if p_nivel is not null then
        select * into v from public.niveles where id = p_nivel and negocio_id = p_negocio;
        if v.id is null then
            raise exception 'Ese nivel no es de este negocio' using errcode = '22023';
        end if;
        perform public.cambiar_permisos(p_negocio, p_usuario, v.permisos, p_sucursales);
    else
        perform public.cambiar_permisos(p_negocio, p_usuario, p_permisos, p_sucursales);
    end if;
    update public.miembros set nivel_id = p_nivel where negocio_id = p_negocio and user_id = p_usuario;
end $$;

revoke all on function public.crear_niveles_base(uuid), public.niveles_al_crear_negocio(),
                       public.guardar_nivel(uuid, uuid, text, text, text[], boolean), public.borrar_nivel(uuid),
                       public.cambiar_acceso(uuid, uuid, uuid, text[], uuid[])
    from public, anon, authenticated;
grant execute on function public.guardar_nivel(uuid, uuid, text, text, text[], boolean), public.borrar_nivel(uuid),
                          public.cambiar_acceso(uuid, uuid, uuid, text[], uuid[])
    to authenticated;
