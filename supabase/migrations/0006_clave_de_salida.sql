-- =====================================================================
-- Prezio · 0006 · Clave para salir de las apps Prezio (Android y Windows)
-- Ejecutar en Supabase › SQL Editor DESPUÉS de 0001–0005. Idempotente.
--
-- Las apps abren el verificador a pantalla completa y no dejan salir. Para mantenimiento se sale con una
-- clave por negocio que pone el dueño o un admin en Prezio › Equipos. Aquí solo se guarda su huella
-- (PBKDF2-SHA256 con sal, calculada en el navegador); los equipos la reciben y la comprueban sin internet.
-- =====================================================================

create table if not exists public.negocio_salida (
    negocio_id uuid primary key references public.negocios(id) on delete cascade,
    salida jsonb not null check (
        salida ->> 'sal' ~ '^[0-9a-f]{32}$' and salida ->> 'hash' ~ '^[0-9a-f]{64}$'
        and (salida ->> 'iter')::int between 100000 and 2000000),
    cambiada timestamptz not null default now(),
    cambiada_por uuid references auth.users(id) on delete set null
);
alter table public.negocio_salida enable row level security;
revoke all on public.negocio_salida from anon, authenticated;
grant select (negocio_id, cambiada) on public.negocio_salida to authenticated;
drop policy if exists salida_ver on public.negocio_salida;
create policy salida_ver on public.negocio_salida for select to authenticated using (public.administra(negocio_id));

create or replace function public.guardar_salida(p_negocio uuid, p_salida jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
    if not public.administra(p_negocio) then
        raise exception 'Solo el dueño o un administrador cambian la clave de salida' using errcode = '42501';
    end if;
    if p_salida is null then
        delete from public.negocio_salida where negocio_id = p_negocio;
        return;
    end if;
    insert into public.negocio_salida (negocio_id, salida, cambiada_por)
    values (p_negocio, jsonb_build_object('sal', p_salida ->> 'sal', 'iter', (p_salida ->> 'iter')::int, 'hash', p_salida ->> 'hash'), auth.uid())
    on conflict (negocio_id) do update set salida = excluded.salida, cambiada = now(), cambiada_por = auth.uid();
end $$;
revoke all on function public.guardar_salida(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.guardar_salida(uuid, jsonb) to authenticated;

-- El estado del equipo ahora incluye la huella de la clave de salida.
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
        -- clave para salir de la app (solo su huella PBKDF2: el equipo la comprueba sin internet)
        'salida', (select x.salida from public.negocio_salida x where x.negocio_id = v.negocio_id),
        'hora', now());
end $$;
