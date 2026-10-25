-- =====================================================================
-- Prezio · 0011 · Licencias: el código del negocio es su licencia (PREZIO-XXXX-XXXX-XXXX).
-- Ejecutar en Supabase › SQL Editor DESPUÉS de 0010. Idempotente.
--
-- - Cada negocio tiene una licencia única con la que sus usuarios entran (en la web y en la app).
-- - Nace con 30 días de prueba. Al vencer, el negocio queda bloqueado (como suspendido) hasta que se registre
--   el pago en la Plataforma: plan Básico o Profesional, pagado hasta una fecha.
-- - Los negocios que ya existían reciben su licencia y (si están en prueba) 30 días desde hoy.
-- =====================================================================

alter table public.negocios add column if not exists licencia text;
alter table public.negocios add column if not exists pagado_hasta timestamptz;
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'negocios_licencia_formato') then
        alter table public.negocios add constraint negocios_licencia_formato
            check (licencia ~ '^PREZIO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$');
    end if;
end $$;
create unique index if not exists negocios_licencia_idx on public.negocios (licencia);

-- 12 caracteres al azar sin los que se confunden (0/O, 1/I/L): PREZIO-K7QM-2XRP-H9TD
create or replace function public.generar_licencia()
returns text language plpgsql volatile set search_path = '' as $$
declare
    v_letras constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789A';   -- 32 (la A repetida no importa)
    v_b bytea;
    v text;
begin
    loop
        v_b := sha256(convert_to(gen_random_uuid()::text || clock_timestamp()::text, 'UTF8'));
        v := 'PREZIO-';
        for i in 0..11 loop
            v := v || substr(v_letras, (get_byte(v_b, i) % 32) + 1, 1);
            if i in (3, 7) then v := v || '-'; end if;
        end loop;
        exit when not exists (select 1 from public.negocios where licencia = v);
    end loop;
    return v;
end $$;

create or replace function public.licencia_al_crear()
returns trigger language plpgsql set search_path = '' as $$
begin
    if new.licencia is null then
        new.licencia := public.generar_licencia();
    end if;
    return new;
end $$;
drop trigger if exists negocios_licencia on public.negocios;
create trigger negocios_licencia before insert on public.negocios for each row execute function public.licencia_al_crear();

-- Los negocios que ya existían: su licencia y, si están en prueba, 30 días desde hoy (una sola vez).
update public.negocios
set prueba_hasta = case when plan = 'prueba' then greatest(prueba_hasta, now() + interval '30 days') else prueba_hasta end,
    licencia = public.generar_licencia()
where licencia is null;
alter table public.negocios alter column licencia set not null;

-- Historial de pagos registrados en la Plataforma.
create table if not exists public.licencia_pagos (
    id uuid primary key default gen_random_uuid(),
    negocio_id uuid not null references public.negocios(id) on delete cascade,
    plan text not null check (plan in ('basico', 'profesional')),
    meses integer not null check (meses between 1 and 36),
    hasta timestamptz not null,
    nota text check (length(nota) <= 200),
    registrado_por uuid references auth.users(id) on delete set null,
    creado timestamptz not null default now()
);
create index if not exists licencia_pagos_negocio_idx on public.licencia_pagos (negocio_id, creado desc);
alter table public.licencia_pagos enable row level security;
revoke all on public.licencia_pagos from anon, authenticated;

-- ¿Bloqueado? Suspendido a mano, prueba vencida o pago vencido. Todo lo demás (panel, verificadores,
-- celular, conector) ya pasa por esta función desde 0010.
create or replace function public.negocio_suspendido(p_negocio uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select coalesce((
        select n.plan = 'suspendido'
            or (n.plan = 'prueba' and n.prueba_hasta < now())
            or (n.plan in ('basico', 'profesional') and n.pagado_hasta is not null and n.pagado_hasta < now())
        from public.negocios n where n.id = p_negocio), false)
$$;

-- Estado de la licencia para el panel (miembros) y la Plataforma.
create or replace function public.negocio_licencia(p_negocio uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    n public.negocios;
    v_vence timestamptz;
begin
    if not (public.es_miembro(p_negocio) or public.es_plataforma()) then
        raise exception 'No tienes acceso a este negocio' using errcode = '42501';
    end if;
    select * into n from public.negocios where id = p_negocio;
    v_vence := case when n.plan = 'prueba' then n.prueba_hasta when n.plan in ('basico', 'profesional') then n.pagado_hasta end;
    return jsonb_build_object(
        'licencia', n.licencia, 'plan', n.plan, 'vence', v_vence,
        'dias', case when v_vence is null then null else ceil(extract(epoch from (v_vence - now())) / 86400)::int end,
        'estado', case when n.plan = 'suspendido' then 'suspendida'
                       when public.negocio_suspendido(n.id) then 'vencida'
                       when n.plan = 'prueba' then 'prueba' else 'activa' end);
end $$;

-- Entrar con el código: la licencia (PREZIO-…) o, como antes, el código de la dirección (abarrotao-market).
create or replace function public.negocio_de_slug(p_slug text)
returns uuid language sql stable security definer set search_path = '' as $$
    select id from public.negocios
    where licencia = upper(btrim(coalesce(p_slug, ''))) or slug = lower(btrim(coalesce(p_slug, '')))
    limit 1
$$;

-- ---------------------------------------------------------------- la Plataforma cobra
create or replace function public.plataforma_registrar_pago(p_negocio uuid, p_plan text, p_meses integer, p_nota text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_hasta timestamptz;
begin
    if not public.es_plataforma() then
        raise exception 'Solo la plataforma registra pagos' using errcode = '42501';
    end if;
    if coalesce(p_plan, '') not in ('basico', 'profesional') or coalesce(p_meses, 0) not between 1 and 36 then
        raise exception 'Elige el plan y de 1 a 36 meses' using errcode = '22023';
    end if;
    -- Se suma desde hoy o desde donde ya estaba pagado (si todavía no vence).
    select greatest(now(), coalesce(case when plan in ('basico', 'profesional') then pagado_hasta end, now()))
           + make_interval(months => p_meses)
      into v_hasta from public.negocios where id = p_negocio;
    if v_hasta is null then
        raise exception 'Negocio no encontrado' using errcode = '22023';
    end if;
    update public.negocios set plan = p_plan, pagado_hasta = v_hasta where id = p_negocio;
    insert into public.licencia_pagos (negocio_id, plan, meses, hasta, nota, registrado_por)
    values (p_negocio, p_plan, p_meses, v_hasta, nullif(left(btrim(coalesce(p_nota, '')), 200), ''), auth.uid());
    return jsonb_build_object('plan', p_plan, 'pagado_hasta', v_hasta);
end $$;

create or replace function public.plataforma_extender_prueba(p_negocio uuid, p_dias integer)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
    v timestamptz;
begin
    if not public.es_plataforma() then
        raise exception 'Solo la plataforma extiende pruebas' using errcode = '42501';
    end if;
    if coalesce(p_dias, 0) not between 1 and 90 then
        raise exception 'De 1 a 90 días' using errcode = '22023';
    end if;
    update public.negocios set plan = 'prueba', prueba_hasta = greatest(prueba_hasta, now()) + make_interval(days => p_dias)
    where id = p_negocio returning prueba_hasta into v;
    if v is null then
        raise exception 'Negocio no encontrado' using errcode = '22023';
    end if;
    return v;
end $$;

create or replace function public.plataforma_pagos(p_negocio uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
    if not public.es_plataforma() then
        raise exception 'Solo la plataforma' using errcode = '42501';
    end if;
    return coalesce((select jsonb_agg(jsonb_build_object('plan', plan, 'meses', meses, 'hasta', hasta, 'nota', nota, 'creado', creado)
                                      order by creado desc)
                     from public.licencia_pagos where negocio_id = p_negocio), '[]'::jsonb);
end $$;

-- La lista de la Plataforma, con la licencia y sus fechas.
create or replace function public.plataforma_negocios()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
    if not public.es_plataforma() then
        raise exception 'Solo la plataforma' using errcode = '42501';
    end if;
    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', n.id, 'nombre', n.nombre, 'slug', n.slug, 'plan', n.plan, 'moneda', n.moneda, 'creado', n.creado,
            'licencia', n.licencia, 'prueba_hasta', n.prueba_hasta, 'pagado_hasta', n.pagado_hasta,
            'bloqueado', public.negocio_suspendido(n.id),
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

-- Verificadores, celular: «bloqueado» incluye la prueba o el pago vencidos.
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
                                      'apariencia', v_neg.apariencia, 'suspendido', public.negocio_suspendido(v_neg.id)),
        'sucursal', jsonb_build_object('id', v_suc.id, 'nombre', v_suc.nombre, 'codigo', v_suc.codigo),
        'version', case when public.negocio_suspendido(v_neg.id) then 'suspendido' else public.version_precios(v.sucursal_id) end,
        'salida', (select x.salida from public.negocio_salida x where x.negocio_id = v.negocio_id),
        'hora', now());
end $$;

create or replace function public.movil_info(p_negocio text, p_sucursal text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    v_neg public.negocios;
begin
    select * into v_neg from public.negocios where slug = lower(btrim(coalesce(p_negocio, '')));
    if v_neg.id is null then
        return null;
    end if;
    if not v_neg.consulta_movil or public.negocio_suspendido(v_neg.id) then
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
    if v_suc.id is null or not v_suc.activa or not coalesce(v_neg.consulta_movil, false) or public.negocio_suspendido(v_neg.id) then
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

-- Mensajes que sirven también para la licencia vencida.
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
        raise exception 'La licencia del negocio está vencida o suspendida: comunícate con tu proveedor de Prezio' using errcode = '42501';
    end if;
    return v;
end $$;

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
        raise exception 'La licencia del negocio está vencida o suspendida: comunícate con tu proveedor de Prezio' using errcode = '42501';
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

-- Alta: devuelve también la licencia.
create or replace function public.plataforma_licencia_de(p_negocio uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
begin
    if not public.es_plataforma() then
        raise exception 'Solo la plataforma' using errcode = '42501';
    end if;
    return (select licencia from public.negocios where id = p_negocio);
end $$;

revoke all on function public.generar_licencia(), public.licencia_al_crear(), public.negocio_licencia(uuid),
                       public.plataforma_registrar_pago(uuid, text, integer, text), public.plataforma_extender_prueba(uuid, integer),
                       public.plataforma_pagos(uuid), public.plataforma_licencia_de(uuid)
    from public, anon, authenticated;
grant execute on function public.negocio_licencia(uuid), public.plataforma_registrar_pago(uuid, text, integer, text),
                          public.plataforma_extender_prueba(uuid, integer), public.plataforma_pagos(uuid),
                          public.plataforma_licencia_de(uuid)
    to authenticated;
grant execute on function public.negocio_de_slug(text) to anon, authenticated;
