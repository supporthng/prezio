-- =====================================================================
-- Prezio · 0010 · Plataforma: tú das de alta los negocios (y los suspendes); el registro público se cierra.
-- Ejecutar en Supabase › SQL Editor DESPUÉS de 0001–0009. Idempotente.
--
-- Después, UNA vez, hazte administrador de la plataforma (con el correo con el que entras a Prezio):
--     select public.agregar_admin_plataforma('tu-correo@ejemplo.com');
--
-- - Solo los administradores de plataforma crean negocios (con usuario y clave del dueño, o invitándolo por correo).
-- - Un negocio con plan «suspendido»: su panel queda de solo lectura, sus verificadores muestran «servicio
--   suspendido», la consulta desde el celular se apaga y el conector deja de recibir precios. Al reactivarlo
--   todo vuelve solo (los equipos no hay que vincularlos de nuevo).
-- =====================================================================

create table if not exists public.plataforma_admins (
    user_id uuid primary key references auth.users(id) on delete cascade,
    creado timestamptz not null default now()
);
alter table public.plataforma_admins enable row level security;
revoke all on public.plataforma_admins from anon, authenticated;

create or replace function public.es_plataforma()
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.plataforma_admins where user_id = auth.uid())
$$;

-- Solo desde el SQL Editor (no lo puede llamar nadie desde la página).
create or replace function public.agregar_admin_plataforma(p_correo text)
returns text language plpgsql security definer set search_path = '' as $$
declare
    v uuid;
begin
    select id into v from auth.users where lower(email) = lower(btrim(p_correo));
    if v is null then
        raise exception 'No hay ninguna cuenta con ese correo: entra una vez a Prezio con él y repite.';
    end if;
    insert into public.plataforma_admins (user_id) values (v) on conflict do nothing;
    return 'Listo: ' || p_correo || ' administra la plataforma. Entra a /plataforma.';
end $$;

create or replace function public.negocio_suspendido(p_negocio uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select coalesce((select plan = 'suspendido' from public.negocios where id = p_negocio), false)
$$;

-- Un negocio suspendido no cambia nada (todas las reglas y funciones pasan por «puede»).
create or replace function public.puede(p_negocio uuid, p_permiso text, p_sucursal uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
    select not public.negocio_suspendido(p_negocio) and exists (
        select 1 from public.miembros m
        where m.negocio_id = p_negocio and m.user_id = auth.uid()
          and (m.rol = 'dueno'
               or (p_permiso = any (m.permisos)
                   and (m.sucursales is null or (p_sucursal is not null and p_sucursal = any (m.sucursales))))))
$$;

-- ---------------------------------------------------------------- crear negocios: solo la plataforma
create or replace function public.crear_negocio(p_nombre text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
    raise exception 'Los negocios nuevos los da de alta tu proveedor de Prezio' using errcode = '42501';
end $$;

create or replace function public.plataforma_crear_negocio(p_nombre text, p_slug text default null, p_moneda text default 'RD$',
                                                           p_plan text default 'prueba')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_nombre text := btrim(coalesce(p_nombre, ''));
    v_base text;
    v_slug text;
    v_id uuid;
    v_n integer := 1;
begin
    if not public.es_plataforma() then
        raise exception 'Solo la plataforma crea negocios' using errcode = '42501';
    end if;
    if length(v_nombre) < 2 or length(v_nombre) > 80 then
        raise exception 'El nombre del negocio debe tener entre 2 y 80 caracteres' using errcode = '22023';
    end if;
    if coalesce(p_plan, '') not in ('prueba', 'basico', 'profesional') then
        raise exception 'Plan no válido' using errcode = '22023';
    end if;
    if nullif(btrim(coalesce(p_slug, '')), '') is not null then
        v_slug := lower(btrim(p_slug));
        if v_slug !~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$' then
            raise exception 'El código del negocio: de 3 a 40 letras minúsculas, números y guiones (ej.: abarrotao-market)' using errcode = '22023';
        end if;
        if exists (select 1 from public.negocios where slug = v_slug) then
            raise exception 'Ya existe un negocio con el código «%»', v_slug using errcode = '23505';
        end if;
    else
        v_base := trim(both '-' from regexp_replace(
                      lower(translate(v_nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '[^a-z0-9]+', '-', 'g'));
        v_base := left(coalesce(nullif(v_base, ''), 'negocio'), 32);
        if length(v_base) < 3 then
            v_base := v_base || '-negocio';
        end if;
        v_slug := v_base;
        while exists (select 1 from public.negocios where slug = v_slug) loop
            v_n := v_n + 1;
            v_slug := v_base || '-' || v_n;
        end loop;
    end if;
    insert into public.negocios (nombre, slug, moneda, plan, creado_por)
    values (v_nombre, v_slug, left(coalesce(nullif(btrim(p_moneda), ''), 'RD$'), 6), p_plan, auth.uid())
    returning id into v_id;
    insert into public.sucursales (negocio_id, codigo, nombre, es_principal) values (v_id, 'principal', 'Principal', true);
    return jsonb_build_object('id', v_id, 'slug', v_slug);
end $$;

-- El dueño: una cuenta sin correo de ESE negocio (usuario + clave) o una cuenta con correo.
create or replace function public.plataforma_poner_dueno(p_negocio uuid, p_cuenta uuid, p_usuario text default null,
                                                         p_nombre text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
    v_usuario text := nullif(lower(btrim(coalesce(p_usuario, ''))), '');
    v_correo text;
begin
    if not public.es_plataforma() then
        raise exception 'Solo la plataforma asigna dueños' using errcode = '42501';
    end if;
    select email into v_correo from auth.users where id = p_cuenta;
    if v_correo is null then
        raise exception 'Cuenta no válida' using errcode = '22023';
    end if;
    if v_usuario is not null and v_correo <> public.correo_de_usuario(p_negocio, v_usuario) then
        raise exception 'Cuenta de usuario no válida' using errcode = '22023';
    end if;
    if v_usuario is null and v_correo like '%.prezio.invalid' then
        raise exception 'Esa cuenta es de usuario de otro negocio' using errcode = '22023';
    end if;
    insert into public.miembros (negocio_id, user_id, rol, usuario, permisos, sucursales)
    values (p_negocio, p_cuenta, 'dueno', v_usuario, public.permisos_de_rol('dueno'), null)
    on conflict (negocio_id, user_id) do update set rol = 'dueno', permisos = public.permisos_de_rol('dueno'), sucursales = null;
    if nullif(btrim(coalesce(p_nombre, '')), '') is not null then
        update public.perfiles set nombre = left(btrim(p_nombre), 80) where id = p_cuenta;
    end if;
end $$;

-- ¿Ya existe una cuenta con ese correo? (para no invitar dos veces)
create or replace function public.plataforma_cuenta_de_correo(p_correo text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
    if not public.es_plataforma() then
        raise exception 'Solo la plataforma' using errcode = '42501';
    end if;
    return (select id from auth.users where lower(email) = lower(btrim(coalesce(p_correo, ''))) limit 1);
end $$;

create or replace function public.plataforma_cambiar_plan(p_negocio uuid, p_plan text)
returns void language plpgsql security definer set search_path = '' as $$
begin
    if not public.es_plataforma() then
        raise exception 'Solo la plataforma cambia el plan' using errcode = '42501';
    end if;
    if coalesce(p_plan, '') not in ('prueba', 'basico', 'profesional', 'suspendido') then
        raise exception 'Plan no válido' using errcode = '22023';
    end if;
    update public.negocios set plan = p_plan where id = p_negocio;
    if not found then
        raise exception 'Negocio no encontrado' using errcode = '22023';
    end if;
end $$;

-- Deshacer un alta que no se completó (solo negocios recién creados: sin productos, equipos ni consultas).
create or replace function public.plataforma_borrar_negocio(p_negocio uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
    if not public.es_plataforma() then
        raise exception 'Solo la plataforma' using errcode = '42501';
    end if;
    if exists (select 1 from public.productos where negocio_id = p_negocio)
       or exists (select 1 from public.equipos where negocio_id = p_negocio)
       or exists (select 1 from public.consultas where negocio_id = p_negocio) then
        raise exception 'El negocio ya tiene datos: suspéndelo en lugar de borrarlo' using errcode = '42501';
    end if;
    delete from public.negocios where id = p_negocio;
end $$;

-- Lista para la página Plataforma.
create or replace function public.plataforma_negocios()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
    if not public.es_plataforma() then
        raise exception 'Solo la plataforma' using errcode = '42501';
    end if;
    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', n.id, 'nombre', n.nombre, 'slug', n.slug, 'plan', n.plan, 'moneda', n.moneda, 'creado', n.creado,
            'duenos', coalesce((select jsonb_agg(jsonb_build_object(
                                    'usuario', m.usuario,
                                    'correo', case when u.email like '%.prezio.invalid' then null else u.email end,
                                    'confirmado', u.email_confirmed_at is not null or u.email like '%.prezio.invalid'))
                                from public.miembros m join auth.users u on u.id = m.user_id
                                where m.negocio_id = n.id and m.rol = 'dueno'), '[]'::jsonb),
            'usuarios', (select count(*) from public.miembros m where m.negocio_id = n.id),
            'sucursales', (select count(*) from public.sucursales s where s.negocio_id = n.id),
            'equipos', (select count(*) from public.equipos e where e.negocio_id = n.id),
            'equipos_activos', (select count(*) from public.equipos e where e.negocio_id = n.id and e.visto > now() - interval '1 day'),
            'productos', (select count(*) from public.productos p where p.negocio_id = n.id),
            'ultima_consulta', (select max(c.creado) from public.consultas c where c.negocio_id = n.id))
          order by n.creado desc)
        from public.negocios n), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- un negocio suspendido deja de dar precios
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
                                      'apariencia', v_neg.apariencia, 'suspendido', v_neg.plan = 'suspendido'),
        'sucursal', jsonb_build_object('id', v_suc.id, 'nombre', v_suc.nombre, 'codigo', v_suc.codigo),
        'version', case when v_neg.plan = 'suspendido' then 'suspendido' else public.version_precios(v.sucursal_id) end,
        'salida', (select x.salida from public.negocio_salida x where x.negocio_id = v.negocio_id),
        'hora', now());
end $$;

create or replace function public.equipo_catalogo(p_clave text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    v public.equipos := public.equipo_de_clave(p_clave);
    v_inv uuid := public.inventario_de_sucursal(v.sucursal_id);
begin
    if public.negocio_suspendido(v.negocio_id) then
        return jsonb_build_object('version', 'suspendido', 'productos', '[]'::jsonb);
    end if;
    return jsonb_build_object(
        'version', public.version_precios(v.sucursal_id),
        'productos', coalesce((select jsonb_agg(jsonb_build_array(p.codigo, p.nombre, p.precio) order by p.codigo)
                               from public.productos p where p.inventario_id = v_inv), '[]'::jsonb));
end $$;

create or replace function public.conector_de_clave(p_clave text)
returns public.conectores language plpgsql stable security definer set search_path = '' as $$
declare
    v public.conectores;
begin
    if p_clave is null or length(p_clave) < 32 or length(p_clave) > 128 then
        raise exception 'conector_no_valido' using errcode = 'P0001';
    end if;
    select * into v from public.conectores where huella = public.huella_de(p_clave);
    if not found then
        raise exception 'conector_no_valido' using errcode = 'P0001';
    end if;
    if public.negocio_suspendido(v.negocio_id) then
        raise exception 'El negocio está suspendido: comunícate con tu proveedor de Prezio' using errcode = '42501';
    end if;
    return v;
end $$;

-- La consulta desde el celular de un negocio suspendido queda apagada.
do $$
begin
    if exists (select 1 from pg_proc where proname = 'movil_info' and pronamespace = 'public'::regnamespace) then
        execute $f$
        create or replace function public.movil_info(p_negocio text, p_sucursal text default null)
        returns jsonb language plpgsql stable security definer set search_path = '' as $b$
        declare
            v_neg public.negocios;
        begin
            select * into v_neg from public.negocios where slug = lower(btrim(coalesce(p_negocio, '')));
            if v_neg.id is null then
                return null;
            end if;
            if not v_neg.consulta_movil or v_neg.plan = 'suspendido' then
                return jsonb_build_object('activa', false, 'negocio', jsonb_build_object('nombre', v_neg.nombre));
            end if;
            return jsonb_build_object(
                'activa', true,
                'negocio', jsonb_build_object('nombre', v_neg.nombre, 'slug', v_neg.slug, 'moneda', v_neg.moneda,
                    'apariencia', jsonb_build_object(
                        'color_marca', v_neg.apariencia -> 'color_marca', 'logo', v_neg.apariencia -> 'logo',
                        'mostrar_logo', v_neg.apariencia -> 'mostrar_logo', 'estilo', v_neg.apariencia -> 'estilo')),
                'sucursales', coalesce((
                    select jsonb_agg(jsonb_build_object('id', s.id, 'codigo', s.codigo, 'nombre', s.nombre, 'es_principal', s.es_principal,
                                                        'ubicacion', s.geo_activa and s.latitud is not null, 'radio_m', s.radio_m)
                                     order by s.es_principal desc, s.nombre)
                    from public.sucursales s
                    where s.negocio_id = v_neg.id and s.activa and (p_sucursal is null or s.codigo = lower(btrim(p_sucursal)))), '[]'::jsonb));
        end $b$;
        $f$;
    end if;
end $$;

-- Verificador en línea y consulta desde el celular: nada para un negocio suspendido.
create or replace function public.consultar_precio(p_sucursal uuid, p_formas text[], p_canal text default 'verificador')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_negocio uuid;
    v_inv uuid;
    v_prod public.productos;
    v_leido text := btrim(coalesce(p_formas[1], ''));
begin
    select negocio_id into v_negocio from public.sucursales where id = p_sucursal;
    if v_negocio is null or not public.es_miembro(v_negocio) then
        raise exception 'No tienes acceso a esta sucursal' using errcode = '42501';
    end if;
    if public.negocio_suspendido(v_negocio) then
        raise exception 'El negocio está suspendido: comunícate con tu proveedor de Prezio' using errcode = '42501';
    end if;
    if v_leido = '' or length(v_leido) > 64 or coalesce(array_length(p_formas, 1), 0) > 16 then
        raise exception 'Código inválido' using errcode = '22023';
    end if;
    v_inv := public.inventario_de_sucursal(p_sucursal);
    if v_inv is null then
        insert into public.consultas (negocio_id, sucursal_id, codigo, encontrado, canal)
        values (v_negocio, p_sucursal, v_leido, false, left(coalesce(nullif(btrim(p_canal), ''), 'verificador'), 30));
        return jsonb_build_object('encontrado', false, 'codigo', v_leido, 'sin_fuente', true);
    end if;
    select p.* into v_prod from public.productos p
    where p.inventario_id = v_inv and p.codigo = any (p_formas)
    order by array_position(p_formas, p.codigo)
    limit 1;
    insert into public.consultas (negocio_id, sucursal_id, codigo, encontrado, nombre, precio, canal)
    values (v_negocio, p_sucursal, v_leido, v_prod.codigo is not null, v_prod.nombre, v_prod.precio,
            left(coalesce(nullif(btrim(p_canal), ''), 'verificador'), 30));
    if v_prod.codigo is null then
        return jsonb_build_object('encontrado', false, 'codigo', v_leido, 'sin_fuente', false);
    end if;
    return jsonb_build_object('encontrado', true, 'codigo', v_prod.codigo, 'nombre', v_prod.nombre,
                              'precio', v_prod.precio, 'sin_fuente', false);
end $$;

create or replace function public.consulta_movil(p_sucursal uuid, p_formas text[], p_lat double precision default null,
                                                 p_lon double precision default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_suc public.sucursales;
    v_neg public.negocios;
    v_inv uuid;
    v_prod public.productos;
    v_leido text := btrim(coalesce(p_formas[1], ''));
    v_dist double precision;
begin
    select * into v_suc from public.sucursales where id = p_sucursal;
    select * into v_neg from public.negocios where id = v_suc.negocio_id;
    if v_suc.id is null or not v_suc.activa or not coalesce(v_neg.consulta_movil, false) or v_neg.plan = 'suspendido' then
        return jsonb_build_object('error', 'inactiva');
    end if;
    if v_leido = '' or length(v_leido) > 64 or coalesce(array_length(p_formas, 1), 0) > 16 then
        raise exception 'Código inválido' using errcode = '22023';
    end if;
    if v_suc.geo_activa and v_suc.latitud is not null then
        if p_lat is null or p_lon is null or abs(p_lat) > 90 or abs(p_lon) > 180 then
            return jsonb_build_object('error', 'ubicacion');
        end if;
        v_dist := public.distancia_m(v_suc.latitud, v_suc.longitud, p_lat, p_lon);
        if v_dist > v_suc.radio_m then
            return jsonb_build_object('error', 'lejos', 'distancia_m', round(v_dist), 'radio_m', v_suc.radio_m);
        end if;
    end if;
    -- Contra abusos: máximo 300 consultas desde celulares por minuto en cada sucursal.
    if (select count(*) from public.consultas where sucursal_id = p_sucursal and canal = 'movil'
        and creado > now() - interval '1 minute') >= 300 then
        return jsonb_build_object('error', 'limite');
    end if;
    v_inv := public.inventario_de_sucursal(p_sucursal);
    if v_inv is not null then
        select p.* into v_prod from public.productos p
        where p.inventario_id = v_inv and p.codigo = any (p_formas)
        order by array_position(p_formas, p.codigo) limit 1;
    end if;
    insert into public.consultas (negocio_id, sucursal_id, codigo, encontrado, nombre, precio, canal)
    values (v_suc.negocio_id, p_sucursal, v_leido, v_prod.codigo is not null, v_prod.nombre, v_prod.precio, 'movil');
    if v_prod.codigo is null then
        return jsonb_build_object('encontrado', false, 'codigo', v_leido);
    end if;
    return jsonb_build_object('encontrado', true, 'codigo', v_prod.codigo, 'nombre', v_prod.nombre, 'precio', v_prod.precio);
end $$;

-- El conector de la app de administrador: uno por PC, creado por quien inicia sesión en la app.
create or replace function public.conector_para_app(p_negocio uuid, p_nombre text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_clave text := 'pzc_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    v_id uuid;
begin
    if not public.puede(p_negocio, 'inventarios') then
        raise exception 'Necesitas la casilla «Inventarios» para conectar una base de datos' using errcode = '42501';
    end if;
    if (select count(*) from public.conectores where negocio_id = p_negocio) >= 10 then
        raise exception 'Máximo 10 conectores por negocio: quita uno viejo en Inventarios' using errcode = '54000';
    end if;
    insert into public.conectores (negocio_id, nombre, huella, creado_por)
    values (p_negocio, coalesce(nullif(left(btrim(coalesce(p_nombre, '')), 60), ''), 'PC'), public.huella_de(v_clave), auth.uid())
    returning id into v_id;
    return jsonb_build_object('id', v_id, 'clave', v_clave);
end $$;

revoke all on function public.es_plataforma(), public.agregar_admin_plataforma(text), public.negocio_suspendido(uuid),
                       public.plataforma_crear_negocio(text, text, text, text), public.plataforma_poner_dueno(uuid, uuid, text, text),
                       public.plataforma_cuenta_de_correo(text), public.plataforma_cambiar_plan(uuid, text),
                       public.plataforma_borrar_negocio(uuid), public.plataforma_negocios(), public.conector_para_app(uuid, text)
    from public, anon, authenticated;
grant execute on function public.es_plataforma(), public.negocio_suspendido(uuid),
                          public.plataforma_crear_negocio(text, text, text, text), public.plataforma_poner_dueno(uuid, uuid, text, text),
                          public.plataforma_cuenta_de_correo(text), public.plataforma_cambiar_plan(uuid, text),
                          public.plataforma_borrar_negocio(uuid), public.plataforma_negocios(), public.conector_para_app(uuid, text)
    to authenticated;
