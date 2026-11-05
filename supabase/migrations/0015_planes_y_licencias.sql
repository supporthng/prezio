-- =====================================================================
-- Prezcio · 0015 · Licenciamiento completo (como factpos y fumio). Ejecutar DESPUÉS de 0014. Idempotente.
--
--  1. Planes editables en Plataforma: precio, mensual/anual, permanente, destacado, límites
--     (sucursales, verificadores, usuarios, PCs con Prezcio Administrador).
--  2. Los límites se cumplen al crear sucursales, vincular verificadores y crear usuarios.
--  3. Estados: prueba · activa · por vencer (aviso) · gracia (sigue funcionando unos días) · vencida · suspendida.
--  4. Solicitudes de activación o cambio de plan desde el panel del negocio (y la app), con bandeja en Plataforma.
--  5. Ajustes de la Plataforma: contacto del proveedor, días de prueba, aviso, gracia, plazo de respuesta,
--     descuento anual y límites de la prueba.
--  6. Historial de cada licencia y roles en Plataforma (administrador, ventas, soporte).
--  7. La licencia queda amarrada a la(s) PC(s) de Prezcio Administrador; la Plataforma las libera.
--
-- Los negocios que ya existen siguen igual: mismo plan, mismas fechas.
-- =====================================================================

-- ================================================================ 5. ajustes (los usan los demás bloques)
create table if not exists public.plataforma_ajustes (
    id smallint primary key default 1 check (id = 1),
    contacto_nombre text check (length(contacto_nombre) <= 80),
    contacto_telefono text check (length(contacto_telefono) <= 30),
    contacto_whatsapp text check (length(contacto_whatsapp) <= 30),
    contacto_correo text check (length(contacto_correo) <= 120),
    contacto_horario text check (length(contacto_horario) <= 120),
    dias_prueba integer not null default 30 check (dias_prueba between 1 and 365),
    dias_aviso integer not null default 15 check (dias_aviso between 1 and 60),
    dias_gracia integer not null default 7 check (dias_gracia between 0 and 60),
    plazo_horas integer not null default 24 check (plazo_horas between 1 and 720),
    descuento_anual integer not null default 0 check (descuento_anual between 0 and 50),
    moneda text not null default 'US$' check (length(moneda) between 1 and 6),
    -- Límites de la prueba (vacío = sin límite)
    prueba_sucursales integer check (prueba_sucursales between 1 and 9999),
    prueba_equipos integer check (prueba_equipos between 0 and 99999),
    prueba_usuarios integer check (prueba_usuarios between 1 and 9999),
    prueba_pcs integer default 1 check (prueba_pcs between 1 and 99),
    actualizado timestamptz not null default now()
);
insert into public.plataforma_ajustes (id) values (1) on conflict do nothing;
alter table public.plataforma_ajustes enable row level security;
revoke all on public.plataforma_ajustes from anon, authenticated;

-- PCs con Prezcio Administrador (bloque 7; la tabla va primero porque la usan los límites)
create table if not exists public.licencia_pcs (
    id uuid primary key default gen_random_uuid(),
    negocio_id uuid not null references public.negocios(id) on delete cascade,
    equipo text not null check (equipo ~ '^[0-9a-f-]{36}$'),
    nombre text check (length(nombre) <= 80),
    version text check (length(version) <= 20),
    activada timestamptz not null default now(),
    visto timestamptz not null default now(),
    liberada timestamptz,
    unique (negocio_id, equipo)
);
alter table public.licencia_pcs enable row level security;
revoke all on public.licencia_pcs from anon, authenticated;

-- ================================================================ 6. roles de la Plataforma
alter table public.plataforma_admins add column if not exists rol text not null default 'administrador';
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'plataforma_admins_rol') then
        alter table public.plataforma_admins add constraint plataforma_admins_rol
            check (rol in ('administrador', 'ventas', 'soporte'));
    end if;
end $$;

create or replace function public.plataforma_rol()
returns text language sql stable security definer set search_path = '' as $$
    select rol from public.plataforma_admins where user_id = auth.uid()
$$;
-- administrador y ventas cambian cosas; soporte solo mira.
create or replace function public.plataforma_escribe()
returns boolean language sql stable security definer set search_path = '' as $$
    select coalesce(public.plataforma_rol() in ('administrador', 'ventas'), false)
$$;
create or replace function public.plataforma_es_admin()
returns boolean language sql stable security definer set search_path = '' as $$
    select coalesce(public.plataforma_rol() = 'administrador', false)
$$;

-- ================================================================ 1. planes
create table if not exists public.planes (
    codigo text primary key
        check (codigo ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$' and codigo not in ('prueba', 'suspendido')),
    nombre text not null check (length(btrim(nombre)) between 2 and 40),
    descripcion text check (length(descripcion) <= 200),
    precio numeric(12, 2) not null default 0 check (precio >= 0),
    periodo text not null default 'mensual' check (periodo in ('mensual', 'anual')),
    permanente boolean not null default false,                 -- pago único, sin vencimiento
    max_sucursales integer check (max_sucursales between 1 and 9999),   -- vacío = sin límite
    max_equipos integer check (max_equipos between 0 and 99999),
    max_usuarios integer check (max_usuarios between 1 and 9999),
    max_pcs integer default 1 check (max_pcs between 1 and 99),
    funciones text[] not null default '{}',
    destacado boolean not null default false,
    etiqueta text check (length(etiqueta) <= 30),
    activo boolean not null default true,
    orden integer not null default 100,
    creado timestamptz not null default now()
);
insert into public.planes (codigo, nombre, descripcion, max_sucursales, max_equipos, max_usuarios, max_pcs, funciones, orden) values
    ('basico', 'Básico', 'Una tienda con sus verificadores.', 1, 3, 5, 1,
     array['Verificadores sin internet', 'Consulta desde el celular', 'Copia automática de la base de datos'], 10),
    ('profesional', 'Profesional', 'Varias sucursales y más verificadores.', 5, 25, 25, 2,
     array['Todo lo del Básico', 'Varias sucursales', 'Niveles de acceso por sucursal', 'Reportes por sucursal'], 20)
on conflict (codigo) do nothing;
alter table public.planes enable row level security;
revoke all on public.planes from anon, authenticated;

-- El plan de un negocio: «prueba», «suspendido» o un plan de la tabla.
alter table public.negocios drop constraint if exists negocios_plan_check;
alter table public.negocios add column if not exists plan_antes text;       -- el plan que tenía antes de suspenderlo
create or replace function public.negocio_plan_valido()
returns trigger language plpgsql set search_path = '' as $$
begin
    if new.plan not in ('prueba', 'suspendido') and not exists (select 1 from public.planes where codigo = new.plan) then
        raise exception 'Plan no válido: %', new.plan using errcode = '22023';
    end if;
    return new;
end $$;
drop trigger if exists negocios_plan_valido on public.negocios;
create trigger negocios_plan_valido before insert or update of plan on public.negocios
    for each row execute function public.negocio_plan_valido();

alter table public.licencia_pagos drop constraint if exists licencia_pagos_plan_check;
alter table public.licencia_pagos drop constraint if exists licencia_pagos_meses_check;
alter table public.licencia_pagos add column if not exists monto numeric(12, 2);
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'licencia_pagos_meses') then
        alter table public.licencia_pagos add constraint licencia_pagos_meses check (meses between 0 and 36);
    end if;
end $$;

-- ================================================================ 3. estados (prueba, activa, por vencer, gracia…)
-- ¿Bloqueado? Suspendido, prueba vencida, o pago vencido hace más de los días de gracia.
create or replace function public.negocio_suspendido(p_negocio uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select coalesce((
        select n.plan = 'suspendido'
            or (n.plan = 'prueba' and n.prueba_hasta < now())
            or (n.plan <> 'prueba' and n.pagado_hasta is not null
                and n.pagado_hasta + make_interval(days => coalesce((select a.dias_gracia from public.plataforma_ajustes a where a.id = 1), 7)) < now())
        from public.negocios n where n.id = p_negocio), false)
$$;

-- Estado completo (para el panel, la Plataforma y la app). Sin permisos: lo llaman otras funciones.
create or replace function public.licencia_estado(p_negocio uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    n public.negocios;
    a public.plataforma_ajustes;
    p public.planes;
    v_vence timestamptz;
    v_dias integer;
    v_gracia timestamptz;
    v_estado text;
begin
    select * into n from public.negocios where id = p_negocio;
    if n.id is null then
        return null;
    end if;
    select * into a from public.plataforma_ajustes where id = 1;
    select * into p from public.planes where codigo = case when n.plan = 'suspendido' then n.plan_antes else n.plan end;
    v_vence := case when n.plan = 'prueba' then n.prueba_hasta
                    when p.codigo is not null and not p.permanente then n.pagado_hasta end;
    v_dias := case when v_vence is null then null else ceil(extract(epoch from (v_vence - now())) / 86400)::int end;
    v_gracia := case when n.plan not in ('prueba', 'suspendido') and v_vence is not null
                     then v_vence + make_interval(days => coalesce(a.dias_gracia, 7)) end;
    v_estado := case
        when n.plan = 'suspendido' then 'suspendida'
        when n.plan = 'prueba' then case when v_vence < now() then 'vencida' else 'prueba' end
        when v_vence is null then 'activa'
        when v_gracia < now() then 'vencida'
        when v_vence < now() then 'gracia'
        when v_dias <= coalesce(a.dias_aviso, 15) then 'por_vencer'
        else 'activa' end;
    return jsonb_build_object(
        'estado', v_estado, 'bloqueado', v_estado in ('vencida', 'suspendida'),
        'plan', n.plan, 'plan_antes', n.plan_antes,
        'plan_nombre', coalesce(p.nombre, case n.plan when 'prueba' then 'Prueba' when 'suspendido' then 'Suspendido' else n.plan end),
        'permanente', coalesce(p.permanente, false),
        'vence', v_vence, 'dias', v_dias, 'gracia_hasta', v_gracia,
        'dias_gracia_quedan', case when v_estado = 'gracia' then ceil(extract(epoch from (v_gracia - now())) / 86400)::int end,
        'dias_aviso', coalesce(a.dias_aviso, 15), 'dias_gracia', coalesce(a.dias_gracia, 7));
end $$;

create or replace function public.negocio_licencia(p_negocio uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
    if not (public.es_miembro(p_negocio) or public.es_plataforma()) then
        raise exception 'No tienes acceso a este negocio' using errcode = '42501';
    end if;
    return public.licencia_estado(p_negocio)
        || jsonb_build_object('licencia', (select licencia from public.negocios where id = p_negocio));
end $$;

-- ================================================================ 2. límites del plan
create or replace function public.limites_negocio(p_negocio uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
    select case
        when n.plan = 'prueba' then
            (select jsonb_build_object('sucursales', a.prueba_sucursales, 'equipos', a.prueba_equipos,
                                       'usuarios', a.prueba_usuarios, 'pcs', a.prueba_pcs)
             from public.plataforma_ajustes a where a.id = 1)
        else coalesce(
            (select jsonb_build_object('sucursales', p.max_sucursales, 'equipos', p.max_equipos,
                                       'usuarios', p.max_usuarios, 'pcs', p.max_pcs)
             from public.planes p where p.codigo = case when n.plan = 'suspendido' then n.plan_antes else n.plan end),
            jsonb_build_object('sucursales', null, 'equipos', null, 'usuarios', null, 'pcs', null))
        end
    from public.negocios n where n.id = p_negocio
$$;

create or replace function public.uso_negocio(p_negocio uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
    select jsonb_build_object(
        'sucursales', (select count(*) from public.sucursales where negocio_id = p_negocio),
        'equipos', (select count(*) from public.equipos where negocio_id = p_negocio),
        'usuarios', (select count(*) from public.miembros where negocio_id = p_negocio),
        'pcs', (select count(*) from public.licencia_pcs where negocio_id = p_negocio and liberada is null))
$$;

create or replace function public.verificar_limite()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    v_recurso text := tg_argv[0];
    v_limite integer;
    v_n integer;
begin
    if v_recurso = 'usuarios' then
        if new.rol = 'dueno' then
            return new;                               -- la Plataforma siempre puede ponerle dueño
        end if;
    end if;
    v_limite := (public.limites_negocio(new.negocio_id) ->> v_recurso)::int;
    if v_limite is null then
        return new;
    end if;
    execute format('select count(*) from public.%I where negocio_id = $1', tg_table_name) into v_n using new.negocio_id;
    if v_n >= v_limite then
        raise exception 'Tu plan permite % % y ya tienes %. Para agregar más, amplía tu plan en Licencia.',
            v_limite,
            case v_recurso when 'sucursales' then case when v_limite = 1 then 'sucursal' else 'sucursales' end
                           when 'equipos' then case when v_limite = 1 then 'verificador' else 'verificadores' end
                           else case when v_limite = 1 then 'usuario' else 'usuarios' end end,
            v_n
            using errcode = 'P0001';
    end if;
    return new;
end $$;
drop trigger if exists sucursales_limite on public.sucursales;
create trigger sucursales_limite before insert on public.sucursales
    for each row execute function public.verificar_limite('sucursales');
drop trigger if exists equipos_limite on public.equipos;
create trigger equipos_limite before insert on public.equipos
    for each row execute function public.verificar_limite('equipos');
drop trigger if exists miembros_limite on public.miembros;
create trigger miembros_limite before insert on public.miembros
    for each row execute function public.verificar_limite('usuarios');

-- ================================================================ 6. historial de cada licencia
create table if not exists public.licencia_eventos (
    id bigint generated always as identity primary key,
    negocio_id uuid not null references public.negocios(id) on delete cascade,
    tipo text not null,
    detalle jsonb not null default '{}'::jsonb,
    usuario uuid references auth.users(id) on delete set null,
    creado timestamptz not null default now()
);
create index if not exists licencia_eventos_negocio_idx on public.licencia_eventos (negocio_id, creado desc);
alter table public.licencia_eventos enable row level security;
revoke all on public.licencia_eventos from anon, authenticated;

create or replace function public.anotar_evento(p_negocio uuid, p_tipo text, p_detalle jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
    insert into public.licencia_eventos (negocio_id, tipo, detalle, usuario) values (p_negocio, p_tipo, coalesce(p_detalle, '{}'::jsonb), auth.uid())
$$;

-- Altas y cambios de plan se anotan solos.
create or replace function public.negocios_historial()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if tg_op = 'INSERT' then
        perform public.anotar_evento(new.id, 'alta', jsonb_build_object('plan', new.plan, 'prueba_hasta', new.prueba_hasta));
    elsif new.plan is distinct from old.plan then
        perform public.anotar_evento(new.id,
            case when new.plan = 'suspendido' then 'suspendida' when old.plan = 'suspendido' then 'reactivada' else 'plan' end,
            jsonb_build_object('de', old.plan, 'a', new.plan));
    end if;
    return new;
end $$;
drop trigger if exists negocios_historial on public.negocios;
create trigger negocios_historial after insert or update of plan on public.negocios
    for each row execute function public.negocios_historial();

-- ================================================================ 7. PCs de Prezcio Administrador

-- La app la llama al activarse con la licencia (y al abrir, si la PC aún no estaba registrada).
create or replace function public.activar_pc(p_licencia text, p_equipo text, p_nombre text default null, p_version text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_neg uuid := public.negocio_de_slug(p_licencia);
    v public.licencia_pcs;
    v_limite integer;
    v_otra text;
begin
    if v_neg is null or (select licencia from public.negocios where id = v_neg) <> public.normalizar_licencia(p_licencia) then
        return null;                                   -- solo con la licencia (no con la dirección)
    end if;
    if coalesce(p_equipo, '') !~ '^[0-9a-f-]{36}$' then
        raise exception 'Identificador de PC no válido' using errcode = '22023';
    end if;
    select * into v from public.licencia_pcs where negocio_id = v_neg and equipo = p_equipo;
    if v.id is not null and v.liberada is null then
        update public.licencia_pcs set visto = now(), nombre = coalesce(left(p_nombre, 80), nombre), version = coalesce(left(p_version, 20), version)
        where id = v.id;
    else
        v_limite := (public.limites_negocio(v_neg) ->> 'pcs')::int;
        if v_limite is not null and (select count(*) from public.licencia_pcs where negocio_id = v_neg and liberada is null) >= v_limite then
            select string_agg(coalesce(nombre, 'otra PC'), ', ' order by visto desc) into v_otra
            from public.licencia_pcs where negocio_id = v_neg and liberada is null;
            raise exception 'Esta licencia ya está activa en %: tu plan permite % PC. Pide a tu proveedor que libere una para usarla aquí.',
                v_otra, v_limite using errcode = 'P0001';
        end if;
        insert into public.licencia_pcs (negocio_id, equipo, nombre, version) values (v_neg, p_equipo, left(p_nombre, 80), left(p_version, 20))
        on conflict (negocio_id, equipo) do update set liberada = null, activada = now(), visto = now(),
            nombre = excluded.nombre, version = excluded.version;
        perform public.anotar_evento(v_neg, 'pc_activada', jsonb_build_object('pc', left(p_nombre, 80)));
    end if;
    return public.licencia_info(p_licencia);
end $$;

-- Al abrir la app: ¿esta PC sigue activa? «activa», «liberada» o «nueva» (aún no registrada).
create or replace function public.pc_estado(p_licencia text, p_equipo text, p_version text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
    v_neg uuid := public.negocio_de_slug(p_licencia);
    v public.licencia_pcs;
begin
    if v_neg is null then
        return 'liberada';
    end if;
    select * into v from public.licencia_pcs where negocio_id = v_neg and equipo = p_equipo;
    if v.id is null then
        return 'nueva';
    end if;
    if v.liberada is not null then
        return 'liberada';
    end if;
    update public.licencia_pcs set visto = now(), version = coalesce(left(p_version, 20), version) where id = v.id;
    return 'activa';
end $$;

-- ================================================================ 4. solicitudes de activación o cambio de plan
create table if not exists public.solicitudes_plan (
    id uuid primary key default gen_random_uuid(),
    negocio_id uuid not null references public.negocios(id) on delete cascade,
    plan text not null references public.planes(codigo) on update cascade,
    meses integer not null default 1 check (meses between 0 and 36),
    contacto text check (length(contacto) <= 80),
    telefono text check (length(telefono) <= 30),
    correo text check (length(correo) <= 120),
    mensaje text check (length(mensaje) <= 500),
    origen text not null default 'panel' check (origen in ('panel', 'app')),
    estado text not null default 'nueva' check (estado in ('nueva', 'contactada', 'aprobada', 'rechazada', 'cancelada')),
    respuesta text check (length(respuesta) <= 300),
    creado timestamptz not null default now(),
    creado_por uuid references auth.users(id) on delete set null,
    atendida timestamptz,
    atendida_por uuid references auth.users(id) on delete set null
);
create unique index if not exists solicitudes_plan_abierta on public.solicitudes_plan (negocio_id) where estado in ('nueva', 'contactada');
create index if not exists solicitudes_plan_estado on public.solicitudes_plan (estado, creado desc);
alter table public.solicitudes_plan enable row level security;
revoke all on public.solicitudes_plan from anon, authenticated;

-- ¿Puede pedir planes en nombre del negocio? El dueño o quien tiene «Usuarios» en todo el negocio
-- (aunque la licencia esté vencida: justamente para renovarla).
create or replace function public.puede_pedir_plan(p_negocio uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.miembros m where m.negocio_id = p_negocio and m.user_id = auth.uid()
                   and (m.rol = 'dueno' or (m.sucursales is null and 'usuarios' = any (m.permisos))))
$$;

create or replace function public.solicitar_plan(p_negocio uuid, p_plan text, p_meses integer, p_contacto text, p_telefono text,
                                                 p_correo text default null, p_mensaje text default null, p_origen text default 'panel')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    p public.planes;
    v_id uuid;
begin
    if not public.puede_pedir_plan(p_negocio) then
        raise exception 'Solo el dueño (o quien administra los usuarios) puede pedir un plan' using errcode = '42501';
    end if;
    select * into p from public.planes where codigo = p_plan and activo;
    if p.codigo is null then
        raise exception 'Elige un plan de la lista' using errcode = '22023';
    end if;
    if not p.permanente and coalesce(p_meses, 0) not between 1 and 36 then
        raise exception 'Elige de 1 a 36 meses' using errcode = '22023';
    end if;
    if length(btrim(coalesce(p_contacto, ''))) < 2 or length(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g')) < 7 then
        raise exception 'Escribe tu nombre y un teléfono para que tu proveedor te contacte' using errcode = '22023';
    end if;
    select id into v_id from public.solicitudes_plan where negocio_id = p_negocio and estado in ('nueva', 'contactada');
    if v_id is null then
        insert into public.solicitudes_plan (negocio_id, plan, meses, contacto, telefono, correo, mensaje, origen, creado_por)
        values (p_negocio, p_plan, case when p.permanente then 0 else p_meses end, left(btrim(p_contacto), 80), left(btrim(p_telefono), 30),
                nullif(left(btrim(coalesce(p_correo, '')), 120), ''), nullif(left(btrim(coalesce(p_mensaje, '')), 500), ''),
                case when p_origen = 'app' then 'app' else 'panel' end, auth.uid())
        returning id into v_id;
    else
        update public.solicitudes_plan set plan = p_plan, meses = case when p.permanente then 0 else p_meses end,
            contacto = left(btrim(p_contacto), 80), telefono = left(btrim(p_telefono), 30),
            correo = nullif(left(btrim(coalesce(p_correo, '')), 120), ''), mensaje = nullif(left(btrim(coalesce(p_mensaje, '')), 500), ''),
            estado = 'nueva', creado = now()
        where id = v_id;
    end if;
    perform public.anotar_evento(p_negocio, 'solicitud', jsonb_build_object('plan', p_plan, 'meses', p_meses));
    return v_id;
end $$;

create or replace function public.cancelar_solicitud(p_negocio uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
    if not public.puede_pedir_plan(p_negocio) then
        raise exception 'No puedes cancelar la solicitud' using errcode = '42501';
    end if;
    update public.solicitudes_plan set estado = 'cancelada', atendida = now(), atendida_por = auth.uid()
    where negocio_id = p_negocio and estado in ('nueva', 'contactada');
    if found then
        perform public.anotar_evento(p_negocio, 'solicitud_cancelada', '{}'::jsonb);
    end if;
end $$;

-- Lo que ve el negocio en su pantalla Licencia.
create or replace function public.licencia_detalle(p_negocio uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    a public.plataforma_ajustes;
begin
    if not (public.es_miembro(p_negocio) or public.es_plataforma()) then
        raise exception 'No tienes acceso a este negocio' using errcode = '42501';
    end if;
    select * into a from public.plataforma_ajustes where id = 1;
    return public.licencia_estado(p_negocio) || jsonb_build_object(
        'licencia', (select licencia from public.negocios where id = p_negocio),
        'limites', public.limites_negocio(p_negocio),
        'uso', public.uso_negocio(p_negocio),
        'puede_pedir', public.puede_pedir_plan(p_negocio),
        'contacto', jsonb_strip_nulls(jsonb_build_object('nombre', a.contacto_nombre, 'telefono', a.contacto_telefono,
                        'whatsapp', a.contacto_whatsapp, 'correo', a.contacto_correo, 'horario', a.contacto_horario)),
        'plazo_horas', a.plazo_horas, 'descuento_anual', a.descuento_anual, 'moneda', a.moneda,
        'planes', coalesce((select jsonb_agg(jsonb_build_object(
                'codigo', p.codigo, 'nombre', p.nombre, 'descripcion', p.descripcion, 'precio', p.precio, 'periodo', p.periodo,
                'permanente', p.permanente, 'destacado', p.destacado, 'etiqueta', p.etiqueta, 'funciones', p.funciones,
                'max_sucursales', p.max_sucursales, 'max_equipos', p.max_equipos, 'max_usuarios', p.max_usuarios, 'max_pcs', p.max_pcs)
                order by p.orden, p.precio) from public.planes p where p.activo), '[]'::jsonb),
        'solicitud', (select jsonb_build_object('id', s.id, 'plan', s.plan, 'meses', s.meses, 'estado', s.estado, 'creado', s.creado,
                                                'plan_nombre', (select nombre from public.planes where codigo = s.plan))
                      from public.solicitudes_plan s where s.negocio_id = p_negocio
                      and (s.estado in ('nueva', 'contactada') or (s.estado = 'rechazada' and s.atendida > now() - interval '15 days'))
                      order by s.creado desc limit 1),
        'respuesta', (select s.respuesta from public.solicitudes_plan s where s.negocio_id = p_negocio and s.estado = 'rechazada'
                      and s.atendida > now() - interval '15 days' order by s.creado desc limit 1),
        'pcs', coalesce((select jsonb_agg(jsonb_build_object('nombre', c.nombre, 'version', c.version, 'activada', c.activada, 'visto', c.visto)
                                          order by c.visto desc)
                         from public.licencia_pcs c where c.negocio_id = p_negocio and c.liberada is null), '[]'::jsonb));
end $$;

-- ================================================================ Plataforma: funciones nuevas y cambiadas
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
    if not public.plataforma_escribe() then
        raise exception 'Solo la plataforma crea negocios' using errcode = '42501';
    end if;
    if length(v_nombre) < 2 or length(v_nombre) > 80 then
        raise exception 'El nombre del negocio debe tener entre 2 y 80 caracteres' using errcode = '22023';
    end if;
    if coalesce(p_plan, '') <> 'prueba' and not exists (select 1 from public.planes where codigo = p_plan) then
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
    insert into public.negocios (nombre, slug, moneda, plan, prueba_hasta, creado_por)
    values (v_nombre, v_slug, left(coalesce(nullif(btrim(p_moneda), ''), 'RD$'), 6), coalesce(p_plan, 'prueba'),
            now() + make_interval(days => coalesce((select dias_prueba from public.plataforma_ajustes where id = 1), 30)), auth.uid())
    returning id into v_id;
    insert into public.sucursales (negocio_id, codigo, nombre, es_principal) values (v_id, 'principal', 'Principal', true);
    return jsonb_build_object('id', v_id, 'slug', v_slug);
end $$;

create or replace function public.plataforma_cambiar_plan(p_negocio uuid, p_plan text)
returns void language plpgsql security definer set search_path = '' as $$
begin
    if not public.plataforma_escribe() then
        raise exception 'Solo la plataforma cambia el plan' using errcode = '42501';
    end if;
    if coalesce(p_plan, '') not in ('prueba', 'suspendido') and not exists (select 1 from public.planes where codigo = p_plan) then
        raise exception 'Plan no válido' using errcode = '22023';
    end if;
    update public.negocios
    set plan_antes = case when p_plan = 'suspendido' and plan <> 'suspendido' then plan
                          when p_plan = 'suspendido' then plan_antes end,
        plan = p_plan
    where id = p_negocio;
    if not found then
        raise exception 'Negocio no encontrado' using errcode = '22023';
    end if;
end $$;

-- Quitar la suspensión: vuelve al plan que tenía (si su pago sigue vigente o en gracia) o a la prueba.
create or replace function public.plataforma_reactivar(p_negocio uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
    n public.negocios;
    v_plan text;
begin
    if not public.plataforma_escribe() then
        raise exception 'Solo la plataforma reactiva negocios' using errcode = '42501';
    end if;
    select * into n from public.negocios where id = p_negocio;
    if n.id is null then
        raise exception 'Negocio no encontrado' using errcode = '22023';
    end if;
    v_plan := case when n.plan_antes is not null and n.plan_antes <> 'prueba' and exists (select 1 from public.planes where codigo = n.plan_antes)
                        and (n.pagado_hasta is null or n.pagado_hasta > now()) then n.plan_antes
                   else 'prueba' end;
    update public.negocios set plan = v_plan, plan_antes = null where id = p_negocio;
    return v_plan;
end $$;

create or replace function public.plataforma_registrar_pago(p_negocio uuid, p_plan text, p_meses integer, p_nota text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    p public.planes;
    a public.plataforma_ajustes;
    v_hasta timestamptz;
    v_monto numeric(12, 2);
begin
    if not public.plataforma_escribe() then
        raise exception 'Solo la plataforma registra pagos' using errcode = '42501';
    end if;
    select * into p from public.planes where codigo = p_plan;
    if p.codigo is null then
        raise exception 'Elige el plan' using errcode = '22023';
    end if;
    if not p.permanente and coalesce(p_meses, 0) not between 1 and 36 then
        raise exception 'Elige el plan y de 1 a 36 meses' using errcode = '22023';
    end if;
    select * into a from public.plataforma_ajustes where id = 1;
    if p.permanente then
        v_hasta := timestamptz '2099-12-31 23:59:59-04';
        v_monto := p.precio;
    else
        -- Se suma desde hoy o desde donde ya estaba pagado (si todavía no vence).
        select greatest(now(), coalesce(case when plan not in ('prueba', 'suspendido') then pagado_hasta end, now()))
               + make_interval(months => p_meses)
          into v_hasta from public.negocios where id = p_negocio;
        v_monto := case when p.periodo = 'anual' then round(p.precio * p_meses / 12.0, 2)
                        else round(p.precio * p_meses * case when p_meses >= 12 then (100 - a.descuento_anual) / 100.0 else 1 end, 2) end;
    end if;
    if v_hasta is null then
        raise exception 'Negocio no encontrado' using errcode = '22023';
    end if;
    update public.negocios set plan = p_plan, plan_antes = null, pagado_hasta = v_hasta where id = p_negocio;
    insert into public.licencia_pagos (negocio_id, plan, meses, hasta, nota, registrado_por, monto)
    values (p_negocio, p_plan, case when p.permanente then 0 else p_meses end, v_hasta,
            nullif(left(btrim(coalesce(p_nota, '')), 200), ''), auth.uid(), v_monto);
    perform public.anotar_evento(p_negocio, 'pago', jsonb_build_object('plan', p_plan, 'meses', p_meses, 'hasta', v_hasta, 'monto', v_monto,
                                                                         'nota', nullif(btrim(coalesce(p_nota, '')), '')));
    return jsonb_build_object('plan', p_plan, 'pagado_hasta', v_hasta, 'permanente', p.permanente, 'monto', v_monto);
end $$;

create or replace function public.plataforma_extender_prueba(p_negocio uuid, p_dias integer)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
    v timestamptz;
begin
    if not public.plataforma_escribe() then
        raise exception 'Solo la plataforma extiende pruebas' using errcode = '42501';
    end if;
    if coalesce(p_dias, 0) not between 1 and 90 then
        raise exception 'De 1 a 90 días' using errcode = '22023';
    end if;
    update public.negocios set plan = 'prueba', plan_antes = null, prueba_hasta = greatest(prueba_hasta, now()) + make_interval(days => p_dias)
    where id = p_negocio returning prueba_hasta into v;
    if v is null then
        raise exception 'Negocio no encontrado' using errcode = '22023';
    end if;
    perform public.anotar_evento(p_negocio, 'prueba', jsonb_build_object('dias', p_dias, 'hasta', v));
    return v;
end $$;

create or replace function public.plataforma_pagos(p_negocio uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
    if not public.es_plataforma() then
        raise exception 'Solo la plataforma' using errcode = '42501';
    end if;
    return coalesce((select jsonb_agg(jsonb_build_object('plan', plan, 'meses', meses, 'hasta', hasta, 'nota', nota, 'monto', monto, 'creado', creado)
                                      order by creado desc)
                     from public.licencia_pagos where negocio_id = p_negocio), '[]'::jsonb);
end $$;

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
            'lic', public.licencia_estado(n.id),
            'limites', public.limites_negocio(n.id),
            'pcs', (select count(*) from public.licencia_pcs c where c.negocio_id = n.id and c.liberada is null),
            'solicitud', (select s.estado from public.solicitudes_plan s where s.negocio_id = n.id and s.estado in ('nueva', 'contactada') limit 1),
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

-- Lo que necesita la pantalla de Plataforma además de los negocios: mi rol, planes, ajustes, solicitudes.
create or replace function public.plataforma_datos()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
    if not public.es_plataforma() then
        raise exception 'Solo la plataforma' using errcode = '42501';
    end if;
    return jsonb_build_object(
        'rol', public.plataforma_rol(),
        'planes', coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object('negocios',
                        (select count(*) from public.negocios n where n.plan = p.codigo or n.plan_antes = p.codigo))
                        order by p.orden, p.precio) from public.planes p), '[]'::jsonb),
        'ajustes', (select to_jsonb(a) - 'id' from public.plataforma_ajustes a where a.id = 1),
        'solicitudes', coalesce((select jsonb_agg(jsonb_build_object(
                'id', s.id, 'negocio_id', s.negocio_id, 'negocio', n.nombre, 'slug', n.slug, 'licencia', n.licencia,
                'plan', s.plan, 'plan_nombre', p.nombre, 'meses', s.meses, 'contacto', s.contacto, 'telefono', s.telefono,
                'correo', s.correo, 'mensaje', s.mensaje, 'origen', s.origen, 'estado', s.estado, 'creado', s.creado,
                'actual', public.licencia_estado(n.id))
                order by s.creado desc)
            from public.solicitudes_plan s join public.negocios n on n.id = s.negocio_id left join public.planes p on p.codigo = s.plan
            where s.estado in ('nueva', 'contactada') or s.atendida > now() - interval '30 days'), '[]'::jsonb),
        'equipo', case when public.plataforma_es_admin() then coalesce((select jsonb_agg(jsonb_build_object(
                'id', x.user_id, 'correo', u.email, 'rol', x.rol, 'yo', x.user_id = auth.uid()) order by x.creado)
            from public.plataforma_admins x join auth.users u on u.id = x.user_id), '[]'::jsonb) end);
end $$;

-- Guardar (crear o cambiar) un plan. Solo administradores.
create or replace function public.plataforma_guardar_plan(p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
    v_codigo text := lower(btrim(coalesce(p ->> 'codigo', '')));
    v_funciones text[] := array(select left(btrim(x), 80) from jsonb_array_elements_text(coalesce(p -> 'funciones', '[]'::jsonb)) x
                                where btrim(x) <> '' limit 12);
    v_permanente boolean := coalesce((p ->> 'permanente')::boolean, false);
begin
    if not public.plataforma_es_admin() then
        raise exception 'Solo un administrador de la plataforma cambia los planes' using errcode = '42501';
    end if;
    insert into public.planes (codigo, nombre, descripcion, precio, periodo, permanente, max_sucursales, max_equipos, max_usuarios, max_pcs,
                               funciones, destacado, etiqueta, activo, orden)
    values (v_codigo, btrim(p ->> 'nombre'), nullif(btrim(coalesce(p ->> 'descripcion', '')), ''),
            coalesce(nullif(p ->> 'precio', '')::numeric, 0), coalesce(nullif(p ->> 'periodo', ''), 'mensual'), v_permanente,
            nullif(p ->> 'max_sucursales', '')::int, nullif(p ->> 'max_equipos', '')::int, nullif(p ->> 'max_usuarios', '')::int,
            nullif(p ->> 'max_pcs', '')::int, v_funciones, coalesce((p ->> 'destacado')::boolean, false),
            nullif(btrim(coalesce(p ->> 'etiqueta', '')), ''), coalesce((p ->> 'activo')::boolean, true),
            coalesce(nullif(p ->> 'orden', '')::int, 100))
    on conflict (codigo) do update set
        nombre = excluded.nombre, descripcion = excluded.descripcion, precio = excluded.precio, periodo = excluded.periodo,
        permanente = excluded.permanente, max_sucursales = excluded.max_sucursales, max_equipos = excluded.max_equipos,
        max_usuarios = excluded.max_usuarios, max_pcs = excluded.max_pcs, funciones = excluded.funciones,
        destacado = excluded.destacado, etiqueta = excluded.etiqueta, activo = excluded.activo, orden = excluded.orden;
    -- Un plan que pasa a permanente: sus negocios quedan sin vencimiento.
    if v_permanente then
        update public.negocios set pagado_hasta = timestamptz '2099-12-31 23:59:59-04' where plan = v_codigo;
    end if;
end $$;

-- Borrar un plan: solo si ningún negocio lo usa (si no, se desactiva para que no se ofrezca).
create or replace function public.plataforma_borrar_plan(p_codigo text)
returns text language plpgsql security definer set search_path = '' as $$
begin
    if not public.plataforma_es_admin() then
        raise exception 'Solo un administrador de la plataforma cambia los planes' using errcode = '42501';
    end if;
    if exists (select 1 from public.negocios where plan = p_codigo or plan_antes = p_codigo)
       or exists (select 1 from public.licencia_pagos where plan = p_codigo)
       or exists (select 1 from public.solicitudes_plan where plan = p_codigo) then
        update public.planes set activo = false where codigo = p_codigo;
        return 'desactivado';
    end if;
    delete from public.planes where codigo = p_codigo;
    return 'borrado';
end $$;

create or replace function public.plataforma_guardar_ajustes(p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
    if not public.plataforma_es_admin() then
        raise exception 'Solo un administrador de la plataforma cambia las reglas' using errcode = '42501';
    end if;
    update public.plataforma_ajustes set
        contacto_nombre = nullif(btrim(coalesce(p ->> 'contacto_nombre', '')), ''),
        contacto_telefono = nullif(btrim(coalesce(p ->> 'contacto_telefono', '')), ''),
        contacto_whatsapp = nullif(btrim(coalesce(p ->> 'contacto_whatsapp', '')), ''),
        contacto_correo = nullif(btrim(coalesce(p ->> 'contacto_correo', '')), ''),
        contacto_horario = nullif(btrim(coalesce(p ->> 'contacto_horario', '')), ''),
        dias_prueba = coalesce(nullif(p ->> 'dias_prueba', '')::int, dias_prueba),
        dias_aviso = coalesce(nullif(p ->> 'dias_aviso', '')::int, dias_aviso),
        dias_gracia = coalesce(nullif(p ->> 'dias_gracia', '')::int, dias_gracia),
        plazo_horas = coalesce(nullif(p ->> 'plazo_horas', '')::int, plazo_horas),
        descuento_anual = coalesce(nullif(p ->> 'descuento_anual', '')::int, descuento_anual),
        moneda = coalesce(nullif(btrim(coalesce(p ->> 'moneda', '')), ''), moneda),
        prueba_sucursales = nullif(p ->> 'prueba_sucursales', '')::int,
        prueba_equipos = nullif(p ->> 'prueba_equipos', '')::int,
        prueba_usuarios = nullif(p ->> 'prueba_usuarios', '')::int,
        prueba_pcs = nullif(p ->> 'prueba_pcs', '')::int,
        actualizado = now()
    where id = 1;
end $$;

-- Atender una solicitud: «contactada», «aprobar» (registra el pago y activa el plan) o «rechazar».
create or replace function public.plataforma_atender_solicitud(p_id uuid, p_accion text, p_meses integer default null, p_respuesta text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
    s public.solicitudes_plan;
begin
    if not public.plataforma_escribe() then
        raise exception 'Solo la plataforma atiende solicitudes' using errcode = '42501';
    end if;
    select * into s from public.solicitudes_plan where id = p_id;
    if s.id is null or s.estado not in ('nueva', 'contactada') then
        raise exception 'Esa solicitud ya fue atendida' using errcode = '22023';
    end if;
    if p_accion = 'contactada' then
        update public.solicitudes_plan set estado = 'contactada', respuesta = nullif(left(btrim(coalesce(p_respuesta, '')), 300), '') where id = p_id;
    elsif p_accion = 'aprobar' then
        perform public.plataforma_registrar_pago(s.negocio_id, s.plan, coalesce(p_meses, s.meses),
                                                 coalesce(nullif(btrim(coalesce(p_respuesta, '')), ''), 'Solicitud aprobada'));
        update public.solicitudes_plan set estado = 'aprobada', meses = coalesce(p_meses, s.meses), atendida = now(), atendida_por = auth.uid(),
            respuesta = nullif(left(btrim(coalesce(p_respuesta, '')), 300), '') where id = p_id;
        perform public.anotar_evento(s.negocio_id, 'solicitud_aprobada', jsonb_build_object('plan', s.plan, 'meses', coalesce(p_meses, s.meses)));
    elsif p_accion = 'rechazar' then
        update public.solicitudes_plan set estado = 'rechazada', atendida = now(), atendida_por = auth.uid(),
            respuesta = nullif(left(btrim(coalesce(p_respuesta, '')), 300), '') where id = p_id;
        perform public.anotar_evento(s.negocio_id, 'solicitud_rechazada', jsonb_build_object('plan', s.plan, 'respuesta', p_respuesta));
    else
        raise exception 'Acción no válida' using errcode = '22023';
    end if;
    return p_accion;
end $$;

-- Historial y PCs de un negocio (para su tarjeta en Plataforma).
create or replace function public.plataforma_historial(p_negocio uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
    if not public.es_plataforma() then
        raise exception 'Solo la plataforma' using errcode = '42501';
    end if;
    return jsonb_build_object(
        'eventos', coalesce((select jsonb_agg(jsonb_build_object('tipo', e.tipo, 'detalle', e.detalle, 'creado', e.creado,
                        'quien', case when u.email like '%.prezio.invalid' then split_part(u.email, '@', 1) else u.email end)
                        order by e.creado desc)
                    from (select * from public.licencia_eventos where negocio_id = p_negocio order by creado desc limit 60) e
                    left join auth.users u on u.id = e.usuario), '[]'::jsonb),
        'pcs', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'version', c.version, 'activada', c.activada,
                        'visto', c.visto, 'liberada', c.liberada) order by c.liberada nulls first, c.visto desc)
                    from public.licencia_pcs c where c.negocio_id = p_negocio), '[]'::jsonb),
        'pagos', public.plataforma_pagos(p_negocio));
end $$;

create or replace function public.plataforma_liberar_pc(p_pc uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
    c public.licencia_pcs;
begin
    if not public.plataforma_escribe() then
        raise exception 'Solo la plataforma libera PCs' using errcode = '42501';
    end if;
    update public.licencia_pcs set liberada = now() where id = p_pc and liberada is null returning * into c;
    if c.id is not null then
        perform public.anotar_evento(c.negocio_id, 'pc_liberada', jsonb_build_object('pc', c.nombre));
    end if;
end $$;

-- Equipo de la Plataforma: solo administradores. La cuenta debe existir (que entre una vez a Prezcio).
create or replace function public.plataforma_poner_usuario(p_correo text, p_rol text)
returns void language plpgsql security definer set search_path = '' as $$
declare
    v uuid;
begin
    if not public.plataforma_es_admin() then
        raise exception 'Solo un administrador de la plataforma maneja el equipo' using errcode = '42501';
    end if;
    if coalesce(p_rol, '') not in ('administrador', 'ventas', 'soporte') then
        raise exception 'Rol no válido' using errcode = '22023';
    end if;
    select id into v from auth.users where lower(email) = lower(btrim(coalesce(p_correo, ''))) and email not like '%.prezio.invalid';
    if v is null then
        raise exception 'No hay ninguna cuenta con ese correo: que entre una vez a Prezcio con él y repite.' using errcode = '22023';
    end if;
    if v = auth.uid() and p_rol <> 'administrador' then
        raise exception 'No puedes quitarte a ti mismo el rol de administrador' using errcode = '22023';
    end if;
    insert into public.plataforma_admins (user_id, rol) values (v, p_rol) on conflict (user_id) do update set rol = excluded.rol;
end $$;

create or replace function public.plataforma_quitar_usuario(p_usuario uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
    if not public.plataforma_es_admin() then
        raise exception 'Solo un administrador de la plataforma maneja el equipo' using errcode = '42501';
    end if;
    if p_usuario = auth.uid() then
        raise exception 'No puedes quitarte a ti mismo' using errcode = '22023';
    end if;
    delete from public.plataforma_admins where user_id = p_usuario;
end $$;

-- Las funciones de antes que cambian cosas: ahora solo administrador o ventas (soporte solo mira).
do $$
declare
    f record;
begin
    for f in
        select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('plataforma_poner_dueno', 'plataforma_borrar_negocio', 'plataforma_cuenta_de_correo')
          and p.prosrc like '%public.es_plataforma()%'
    loop
        execute replace(pg_get_functiondef(f.oid), 'public.es_plataforma()', 'public.plataforma_escribe()');
    end loop;
end $$;

-- ================================================================ permisos
revoke all on function public.plataforma_rol(), public.plataforma_escribe(), public.plataforma_es_admin(),
    public.negocio_plan_valido(), public.licencia_estado(uuid), public.limites_negocio(uuid), public.uso_negocio(uuid),
    public.verificar_limite(), public.anotar_evento(uuid, text, jsonb), public.negocios_historial(),
    public.activar_pc(text, text, text, text), public.pc_estado(text, text, text),
    public.puede_pedir_plan(uuid), public.solicitar_plan(uuid, text, integer, text, text, text, text, text), public.cancelar_solicitud(uuid),
    public.licencia_detalle(uuid), public.plataforma_reactivar(uuid), public.plataforma_datos(),
    public.plataforma_guardar_plan(jsonb), public.plataforma_borrar_plan(text), public.plataforma_guardar_ajustes(jsonb),
    public.plataforma_atender_solicitud(uuid, text, integer, text), public.plataforma_historial(uuid), public.plataforma_liberar_pc(uuid),
    public.plataforma_poner_usuario(text, text), public.plataforma_quitar_usuario(uuid)
    from public, anon, authenticated;
grant execute on function public.plataforma_rol(), public.plataforma_escribe(), public.plataforma_es_admin(),
    public.solicitar_plan(uuid, text, integer, text, text, text, text, text), public.cancelar_solicitud(uuid), public.licencia_detalle(uuid),
    public.plataforma_reactivar(uuid), public.plataforma_datos(), public.plataforma_guardar_plan(jsonb), public.plataforma_borrar_plan(text),
    public.plataforma_guardar_ajustes(jsonb), public.plataforma_atender_solicitud(uuid, text, integer, text), public.plataforma_historial(uuid),
    public.plataforma_liberar_pc(uuid), public.plataforma_poner_usuario(text, text), public.plataforma_quitar_usuario(uuid)
    to authenticated;
-- La app Prezcio Administrador se activa sin sesión (solo con la licencia).
grant execute on function public.activar_pc(text, text, text, text), public.pc_estado(text, text, text) to anon, authenticated;
