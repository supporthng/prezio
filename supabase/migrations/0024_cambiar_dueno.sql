-- Cambiar el dueño de un negocio desde la Plataforma (administración o ventas).
-- El nuevo dueño entra y los anteriores salen en un solo paso; queda anotado en el historial.

-- p_cuenta: cuenta con correo (ya existente o recién invitada). Devuelve las cuentas «usuario» que quedan sin negocio.
create or replace function public.plataforma_cambiar_dueno(p_negocio uuid, p_cuenta uuid, p_nombre text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_correo text;
    antes text[];
    huerfanas uuid[];
begin
    if not public.plataforma_escribe() then
        raise exception 'Solo administración o ventas cambian dueños' using errcode = '42501';
    end if;
    if not exists (select 1 from public.negocios where id = p_negocio) then
        raise exception 'Ese negocio no existe' using errcode = '22023';
    end if;
    select email into v_correo from auth.users where id = p_cuenta;
    if v_correo is null or v_correo like '%.prezio.invalid' then
        raise exception 'El nuevo dueño debe ser una cuenta con correo' using errcode = '22023';
    end if;
    select coalesce(array_agg(case when u.email like '%.prezio.invalid' then coalesce(m.usuario, u.raw_user_meta_data ->> 'correo') else u.email end), '{}')
      into antes
      from public.miembros m join auth.users u on u.id = m.user_id
     where m.negocio_id = p_negocio and m.rol = 'dueno' and m.user_id <> p_cuenta;
    select coalesce(array_agg(m.user_id), '{}') into huerfanas
      from public.miembros m join auth.users u on u.id = m.user_id
     where m.negocio_id = p_negocio and m.rol = 'dueno' and m.user_id <> p_cuenta and u.email like '%.prezio.invalid'
       and not exists (select 1 from public.miembros o where o.user_id = m.user_id and o.negocio_id <> p_negocio)
       and not exists (select 1 from public.plataforma_admins a where a.user_id = m.user_id);
    -- primero salen los anteriores (así no choca con el límite de usuarios del plan)
    delete from public.miembros where negocio_id = p_negocio and rol = 'dueno' and user_id <> p_cuenta;
    insert into public.miembros (negocio_id, user_id, rol, usuario, permisos, sucursales)
    values (p_negocio, p_cuenta, 'dueno', null, public.permisos_de_rol('dueno'), null)
    on conflict (negocio_id, user_id) do update set rol = 'dueno', permisos = public.permisos_de_rol('dueno'), sucursales = null;
    if nullif(btrim(coalesce(p_nombre, '')), '') is not null then
        update public.perfiles set nombre = left(btrim(p_nombre), 80) where id = p_cuenta;
    end if;
    perform public.anotar_evento(p_negocio, 'dueno_cambiado', jsonb_build_object('antes', to_jsonb(antes), 'ahora', v_correo));
    return jsonb_build_object('antes', to_jsonb(antes), 'ahora', v_correo, 'cuentas', to_jsonb(huerfanas));
end $$;
revoke all on function public.plataforma_cambiar_dueno(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.plataforma_cambiar_dueno(uuid, uuid, text) to authenticated;

-- Dueño con usuario y clave: la Plataforma solo cambia su correo de contacto (se guarda en Auth desde el servidor).
-- Devuelve la cuenta a cambiar si es dueño de ese negocio.
create or replace function public.plataforma_dueno_usuario(p_negocio uuid, p_usuario text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v uuid;
begin
    if not public.plataforma_escribe() then
        raise exception 'Solo administración o ventas' using errcode = '42501';
    end if;
    select m.user_id into v from public.miembros m join auth.users u on u.id = m.user_id
     where m.negocio_id = p_negocio and m.rol = 'dueno' and m.usuario = lower(btrim(p_usuario)) and u.email like '%.prezio.invalid';
    return v;
end $$;
revoke all on function public.plataforma_dueno_usuario(uuid, text) from public, anon, authenticated;
grant execute on function public.plataforma_dueno_usuario(uuid, text) to authenticated;
