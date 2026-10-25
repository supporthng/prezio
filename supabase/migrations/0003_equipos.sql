-- =====================================================================
-- Prezio · 0003 · Equipos sin internet (verificadores vinculados a una sucursal)
-- Ejecutar en Supabase › SQL Editor DESPUÉS de 0001 y 0002. Idempotente.
--
-- Cómo se vincula un equipo (como un televisor con una app):
--   1. El equipo abre /e, inventa una clave larga al azar (que nunca sale de él salvo como huella)
--      y pide un código de 8 cifras con solicitar_vinculo(huella).
--   2. El dueño, un admin o el encargado escribe ese código en Prezio › Equipos y elige la sucursal.
--   3. El equipo, con su clave, descarga los precios y la apariencia y queda funcionando sin internet.
-- En la base solo se guarda la huella SHA-256 de la clave: quien vea la base no puede hacerse pasar por el equipo.
-- =====================================================================

create table if not exists public.equipos (
    id uuid primary key default gen_random_uuid(),
    negocio_id uuid not null references public.negocios(id) on delete cascade,
    sucursal_id uuid not null,
    nombre text not null check (length(btrim(nombre)) between 1 and 60),
    huella bytea not null unique,
    creado timestamptz not null default now(),
    creado_por uuid references auth.users(id) on delete set null,
    visto timestamptz,
    app text,
    productos integer,
    pendientes integer,
    version_precios text,
    foreign key (sucursal_id, negocio_id) references public.sucursales(id, negocio_id) on delete cascade
);
create index if not exists equipos_negocio_idx on public.equipos (negocio_id);

-- Códigos de vinculación pendientes (duran 15 minutos).
create table if not exists public.vinculos (
    codigo text primary key check (codigo ~ '^[0-9]{8}$'),
    huella bytea not null unique,
    creado timestamptz not null default now(),
    expira timestamptz not null default (now() + interval '15 minutes')
);

alter table public.consultas add column if not exists equipo_id uuid references public.equipos(id) on delete set null;

alter table public.equipos enable row level security;
alter table public.vinculos enable row level security;
revoke all on public.equipos, public.vinculos from anon, authenticated;
-- Se ven en el panel; se crean, cambian y quitan solo con las funciones de abajo.
grant select on public.equipos to authenticated;
drop policy if exists equipos_ver on public.equipos;
create policy equipos_ver on public.equipos for select to authenticated
    using (public.administra(negocio_id) or public.encarga(negocio_id, sucursal_id));

-- ---------------------------------------------------------------- utilidades
create or replace function public.huella_de(p_clave text)
returns bytea language sql immutable set search_path = '' as $$
    select sha256(convert_to(coalesce(p_clave, ''), 'UTF8'))
$$;

-- El equipo de una clave, o error claro (el equipo lo usa para saber que lo desvincularon).
create or replace function public.equipo_de_clave(p_clave text)
returns public.equipos language plpgsql stable security definer set search_path = '' as $$
declare
    v public.equipos;
begin
    if p_clave is null or length(p_clave) < 32 or length(p_clave) > 128 then
        raise exception 'equipo_no_valido' using errcode = 'P0001';
    end if;
    select * into v from public.equipos where huella = public.huella_de(p_clave);
    if not found then
        if exists (select 1 from public.vinculos where huella = public.huella_de(p_clave) and expira > now()) then
            raise exception 'equipo_pendiente' using errcode = 'P0001';
        end if;
        raise exception 'equipo_no_valido' using errcode = 'P0001';
    end if;
    return v;
end $$;

-- ---------------------------------------------------------------- 1. el equipo pide un código
create or replace function public.solicitar_vinculo(p_clave text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_huella bytea;
    v_codigo text;
    v_expira timestamptz;
begin
    if p_clave is null or length(p_clave) < 32 or length(p_clave) > 128 then
        raise exception 'Clave de equipo inválida' using errcode = '22023';
    end if;
    v_huella := public.huella_de(p_clave);
    if exists (select 1 from public.equipos where huella = v_huella) then
        raise exception 'Este equipo ya está vinculado' using errcode = '22023';
    end if;
    delete from public.vinculos where expira <= now() or huella = v_huella;
    if (select count(*) from public.vinculos) >= 5000 then
        raise exception 'Demasiadas solicitudes. Intenta en unos minutos.' using errcode = '54000';
    end if;
    loop
        v_codigo := lpad((('x' || substr(md5(gen_random_uuid()::text), 1, 8))::bit(32)::bigint % 100000000)::text, 8, '0');
        begin
            insert into public.vinculos (codigo, huella) values (v_codigo, v_huella) returning expira into v_expira;
            exit;
        exception when unique_violation then
            -- código repetido: se prueba otro
        end;
    end loop;
    return jsonb_build_object('codigo', v_codigo, 'expira', v_expira);
end $$;

-- ---------------------------------------------------------------- 2. el panel escribe el código
create or replace function public.vincular_equipo(p_codigo text, p_sucursal uuid, p_nombre text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    v_vinculo public.vinculos;
    v_negocio uuid;
    v_id uuid;
    v_codigo text := regexp_replace(coalesce(p_codigo, ''), '[^0-9]', '', 'g');
begin
    select negocio_id into v_negocio from public.sucursales where id = p_sucursal;
    if v_negocio is null or not (public.administra(v_negocio) or public.encarga(v_negocio, p_sucursal)) then
        raise exception 'No puedes agregar equipos a esta sucursal' using errcode = '42501';
    end if;
    delete from public.vinculos where codigo = v_codigo and expira > now() returning * into v_vinculo;
    if v_vinculo.codigo is null then
        raise exception 'Código no válido o vencido. Mira el código que muestra el equipo ahora.' using errcode = '22023';
    end if;
    insert into public.equipos (negocio_id, sucursal_id, nombre, huella, creado_por)
    values (v_negocio, p_sucursal,
            coalesce(nullif(left(btrim(coalesce(p_nombre, '')), 60), ''),
                     'Equipo ' || (select count(*) + 1 from public.equipos where negocio_id = v_negocio)),
            v_vinculo.huella, auth.uid())
    returning id into v_id;
    return v_id;
end $$;

-- Cambiar nombre o sucursal, y quitar (el equipo vuelve a pedir código).
create or replace function public.cambiar_equipo(p_equipo uuid, p_nombre text, p_sucursal uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
    v public.equipos;
begin
    select * into v from public.equipos where id = p_equipo;
    if v.id is null or not (public.administra(v.negocio_id) or public.encarga(v.negocio_id, v.sucursal_id)) then
        raise exception 'No puedes cambiar este equipo' using errcode = '42501';
    end if;
    if p_sucursal is not null and p_sucursal <> v.sucursal_id then
        -- A otra sucursal del mismo negocio, y el encargado solo a la suya.
        if not exists (select 1 from public.sucursales where id = p_sucursal and negocio_id = v.negocio_id)
           or not (public.administra(v.negocio_id) or public.encarga(v.negocio_id, p_sucursal)) then
            raise exception 'No puedes mover el equipo a esa sucursal' using errcode = '42501';
        end if;
    end if;
    update public.equipos
    set nombre = coalesce(nullif(left(btrim(coalesce(p_nombre, '')), 60), ''), nombre),
        sucursal_id = coalesce(p_sucursal, sucursal_id)
    where id = p_equipo;
end $$;

create or replace function public.quitar_equipo(p_equipo uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
    v public.equipos;
begin
    select * into v from public.equipos where id = p_equipo;
    if v.id is null or not (public.administra(v.negocio_id) or public.encarga(v.negocio_id, v.sucursal_id)) then
        raise exception 'No puedes quitar este equipo' using errcode = '42501';
    end if;
    delete from public.equipos where id = p_equipo;
end $$;

-- ---------------------------------------------------------------- 3. lo que usa el equipo con su clave
-- Versión de los precios de una sucursal: cambia cuando cambia la fuente o se actualiza el inventario.
create or replace function public.version_precios(p_sucursal uuid)
returns text language sql stable security definer set search_path = '' as $$
    select coalesce((select i.id::text || '@' || floor(extract(epoch from i.actualizado) * 1000)::bigint::text
                     from public.inventarios i where i.id = public.inventario_de_sucursal(p_sucursal)), 'sin_fuente')
$$;

-- Para el panel: la versión actual de una sucursal (y así saber si cada equipo está al día).
create or replace function public.version_precios_panel(p_sucursal uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
    v_negocio uuid;
begin
    select negocio_id into v_negocio from public.sucursales where id = p_sucursal;
    if v_negocio is null or not public.es_miembro(v_negocio) then
        return null;
    end if;
    return public.version_precios(p_sucursal);
end $$;

-- Estado: se llama cada pocos minutos. Devuelve nombre, apariencia y versión de precios; anota que el equipo
-- está vivo y cómo está (versión de la app, productos que tiene, consultas por subir).
create or replace function public.equipo_estado(p_clave text, p_app text default null,
                                                p_productos integer default null, p_pendientes integer default null,
                                                p_version text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v public.equipos := public.equipo_de_clave(p_clave);
    v_neg public.negocios;
    v_suc public.sucursales;
begin
    select * into v_neg from public.negocios where id = v.negocio_id;
    select * into v_suc from public.sucursales where id = v.sucursal_id;
    update public.equipos
    set visto = now(), app = left(p_app, 40),
        productos = greatest(0, p_productos), pendientes = greatest(0, p_pendientes),
        version_precios = left(p_version, 120)
    where id = v.id;
    return jsonb_build_object(
        'equipo', jsonb_build_object('id', v.id, 'nombre', v.nombre),
        'negocio', jsonb_build_object('nombre', v_neg.nombre, 'slug', v_neg.slug, 'moneda', v_neg.moneda,
                                      'apariencia', v_neg.apariencia),
        'sucursal', jsonb_build_object('id', v_suc.id, 'nombre', v_suc.nombre, 'codigo', v_suc.codigo),
        'version', public.version_precios(v.sucursal_id),
        'hora', now());
end $$;

-- Todos los precios de la sucursal del equipo: [[código, nombre, precio], …].
create or replace function public.equipo_catalogo(p_clave text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    v public.equipos := public.equipo_de_clave(p_clave);
    v_inv uuid := public.inventario_de_sucursal(v.sucursal_id);
begin
    return jsonb_build_object(
        'version', public.version_precios(v.sucursal_id),
        'productos', coalesce((select jsonb_agg(jsonb_build_array(p.codigo, p.nombre, p.precio) order by p.codigo)
                               from public.productos p where p.inventario_id = v_inv), '[]'::jsonb));
end $$;

-- Subir las consultas hechas sin internet: [{"codigo","encontrado","nombre","precio","hora"}, …], hasta 500.
create or replace function public.equipo_anotar(p_clave text, p_consultas jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
    v public.equipos := public.equipo_de_clave(p_clave);
    v_n integer;
begin
    if jsonb_typeof(p_consultas) <> 'array' or jsonb_array_length(p_consultas) > 500 then
        raise exception 'Envía hasta 500 consultas por vez' using errcode = '22023';
    end if;
    insert into public.consultas (negocio_id, sucursal_id, equipo_id, creado, codigo, encontrado, nombre, precio, canal)
    select v.negocio_id, v.sucursal_id, v.id,
           -- la hora del equipo, pero nunca en el futuro ni de hace más de 30 días
           least(now(), greatest(now() - interval '30 days', coalesce(x.hora, now()))),
           left(btrim(x.codigo), 64), coalesce(x.encontrado, false),
           left(x.nombre, 200), case when x.precio >= 0 and x.precio < 1e12 then x.precio end, 'equipo'
    from jsonb_to_recordset(p_consultas) as x(codigo text, encontrado boolean, nombre text, precio numeric, hora timestamptz)
    where btrim(coalesce(x.codigo, '')) <> '';
    get diagnostics v_n = row_count;
    return v_n;
end $$;

-- ---------------------------------------------------------------- permisos
revoke all on function public.huella_de(text), public.equipo_de_clave(text), public.solicitar_vinculo(text),
                       public.vincular_equipo(text, uuid, text), public.cambiar_equipo(uuid, text, uuid),
                       public.quitar_equipo(uuid), public.version_precios(uuid), public.version_precios_panel(uuid),
                       public.equipo_estado(text, text, integer, integer, text), public.equipo_catalogo(text),
                       public.equipo_anotar(text, jsonb)
    from public, anon, authenticated;
-- El equipo no inicia sesión: usa la clave pública (anon) + su clave de equipo.
grant execute on function public.solicitar_vinculo(text), public.equipo_estado(text, text, integer, integer, text),
                          public.equipo_catalogo(text), public.equipo_anotar(text, jsonb)
    to anon, authenticated;
grant execute on function public.vincular_equipo(text, uuid, text), public.cambiar_equipo(uuid, text, uuid),
                          public.quitar_equipo(uuid), public.version_precios_panel(uuid)
    to authenticated;
