-- =====================================================================
-- Prezio · 0005 · Vincular desde el propio equipo, eligiendo la sucursal, con un usuario que lo autorice
-- Ejecutar en Supabase › SQL Editor DESPUÉS de 0001–0004. Idempotente.
--
-- En la pantalla del equipo, el dueño, un administrador o el encargado entra con su correo y clave
-- (solo para autorizar: la sesión no se queda guardada en el equipo), elige negocio y sucursal, y listo.
-- La base comprueba que esa persona pueda poner equipos en esa sucursal.
-- =====================================================================

create or replace function public.vincular_en_equipo(p_clave text, p_sucursal uuid, p_nombre text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_negocio uuid;
    v_huella bytea;
    v_id uuid;
begin
    if p_clave is null or length(p_clave) < 32 or length(p_clave) > 128 then
        raise exception 'Clave de equipo inválida' using errcode = '22023';
    end if;
    select negocio_id into v_negocio from public.sucursales where id = p_sucursal;
    if v_negocio is null or not (public.administra(v_negocio) or public.encarga(v_negocio, p_sucursal)) then
        raise exception 'Tu usuario no puede poner equipos en esa sucursal' using errcode = '42501';
    end if;
    v_huella := public.huella_de(p_clave);
    if exists (select 1 from public.equipos where huella = v_huella) then
        raise exception 'Este equipo ya está vinculado' using errcode = '22023';
    end if;
    delete from public.vinculos where huella = v_huella;   -- su código de 8 cifras ya no hace falta
    insert into public.equipos (negocio_id, sucursal_id, nombre, huella, creado_por)
    values (v_negocio, p_sucursal,
            coalesce(nullif(left(btrim(coalesce(p_nombre, '')), 60), ''),
                     'Equipo ' || (select count(*) + 1 from public.equipos where negocio_id = v_negocio)),
            v_huella, auth.uid())
    returning id into v_id;
    return jsonb_build_object('equipo', v_id);
end $$;

revoke all on function public.vincular_en_equipo(text, uuid, text) from public, anon, authenticated;
grant execute on function public.vincular_en_equipo(text, uuid, text) to authenticated;
