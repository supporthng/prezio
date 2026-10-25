-- =====================================================================
-- Prezio · 0004 · Inventarios que se llenan solos: Google (hoja o Excel en Drive) y conector de SQL Server
-- Ejecutar en Supabase › SQL Editor DESPUÉS de 0001, 0002 y 0003. Idempotente.
--
-- Todo sigue siendo un INVENTARIO (la sucursal elige uno, como siempre). Lo que cambia es de dónde salen
-- sus productos:
--   inventarios.origen = {}                                   → se carga a mano (Excel / CSV)
--                        {"tipo":"google","url":"…","columnas":{…},"cada_min":60}
--                        {"tipo":"conector","conector_id":"…"}
-- =====================================================================

alter table public.inventarios add column if not exists origen jsonb not null default '{}'::jsonb;
-- {"ultimo": hora de la última carga buena, "productos": n, "error": texto o null, "intento": última vez que se probó}
alter table public.inventarios add column if not exists estado jsonb not null default '{}'::jsonb;
do $$ begin
    alter table public.inventarios add constraint inventarios_origen_valido
        check (coalesce(origen ->> 'tipo', '') in ('', 'google', 'conector'));
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------- cargas por partes
-- Un inventario grande llega en partes («lote»). Al llegar la última, reemplaza los productos de una vez:
-- mientras tanto los verificadores siguen viendo los precios anteriores completos.
create table if not exists public.cargas (
    lote uuid not null,
    inventario_id uuid not null references public.inventarios(id) on delete cascade,
    codigo text not null,
    nombre text not null,
    precio numeric(14, 2) not null,
    creado timestamptz not null default now(),
    primary key (lote, codigo)
);
alter table public.cargas enable row level security;
revoke all on public.cargas from anon, authenticated;

create or replace function public.recibir_parte(p_inventario uuid, p_lote uuid, p_productos jsonb, p_fin boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare
    v_negocio uuid;
    v_n integer;
begin
    if p_lote is null or jsonb_typeof(coalesce(p_productos, '[]'::jsonb)) <> 'array' then
        raise exception 'Parte inválida' using errcode = '22023';
    end if;
    if jsonb_array_length(coalesce(p_productos, '[]'::jsonb)) > 5000 then
        raise exception 'Envía hasta 5000 productos por parte' using errcode = '22023';
    end if;
    select negocio_id into v_negocio from public.inventarios where id = p_inventario;
    insert into public.cargas (lote, inventario_id, codigo, nombre, precio)
        select distinct on (c) p_lote, p_inventario, c, n, pr from (
            select left(btrim(x.codigo), 64) as c, left(btrim(x.nombre), 200) as n, round(x.precio, 2) as pr, t.orden
            from jsonb_array_elements(coalesce(p_productos, '[]'::jsonb)) with ordinality as t(e, orden),
                 jsonb_to_record(t.e) as x(codigo text, nombre text, precio numeric)
            where btrim(coalesce(x.codigo, '')) <> '' and btrim(coalesce(x.nombre, '')) <> ''
              and x.precio >= 0 and x.precio < 1e12
        ) f
        order by c, orden desc   -- código repetido: gana el último, como en Excel
    on conflict (lote, codigo) do update set nombre = excluded.nombre, precio = excluded.precio;
    if not p_fin then
        return 0;
    end if;
    -- Última parte: cambia todos los productos de una vez.
    select count(*) into v_n from public.cargas where lote = p_lote and inventario_id = p_inventario;
    if v_n = 0 then
        delete from public.cargas where lote = p_lote;
        raise exception 'La fuente no devolvió productos: se dejaron los precios anteriores' using errcode = '22023';
    end if;
    delete from public.productos where inventario_id = p_inventario;
    insert into public.productos (inventario_id, negocio_id, codigo, nombre, precio)
        select p_inventario, v_negocio, codigo, nombre, precio from public.cargas
        where lote = p_lote and inventario_id = p_inventario;
    delete from public.cargas where lote = p_lote or creado < now() - interval '1 day';
    update public.inventarios
    set actualizado = now(),
        estado = jsonb_build_object('ultimo', now(), 'productos', v_n, 'error', null, 'intento', now())
    where id = p_inventario;
    return v_n;
end $$;

-- Anota un error de la fuente sin tocar los precios.
create or replace function public.anotar_error_fuente(p_inventario uuid, p_error text)
returns void language sql security definer set search_path = '' as $$
    update public.inventarios
    set estado = estado || jsonb_build_object('error', left(coalesce(p_error, 'Error'), 300), 'error_hora', now(), 'intento', now())
    where id = p_inventario
$$;

-- Desde el panel (dueño o admin): «Actualizar ahora» de una hoja de Google, en partes.
create or replace function public.cargar_inventario(p_inventario uuid, p_lote uuid, p_productos jsonb, p_fin boolean,
                                                    p_error text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
    v_negocio uuid;
begin
    select negocio_id into v_negocio from public.inventarios where id = p_inventario;
    if v_negocio is null or not public.administra(v_negocio) then
        raise exception 'No tienes permiso sobre este inventario' using errcode = '42501';
    end if;
    if p_error is not null then
        perform public.anotar_error_fuente(p_inventario, p_error);
        return 0;
    end if;
    return public.recibir_parte(p_inventario, p_lote, p_productos, p_fin);
end $$;

-- ---------------------------------------------------------------- tareas programadas (Google cada cierto tiempo)
-- Una clave interna que solo conoce la base: la tarea programada la envía a Prezio y Prezio la devuelve aquí.
-- Así Vercel no necesita ninguna clave secreta de Supabase.
create table if not exists public.ajustes_privados (
    clave text primary key,
    valor text not null
);
alter table public.ajustes_privados enable row level security;
revoke all on public.ajustes_privados from anon, authenticated;
insert into public.ajustes_privados (clave, valor)
values ('tareas_secreto', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (clave) do nothing;
-- La dirección de Prezio en Vercel (cámbiala si usas otro dominio):
--   update public.ajustes_privados set valor = 'https://tu-dominio' where clave = 'sitio';
insert into public.ajustes_privados (clave, valor) values ('sitio', 'https://prezio-jade.vercel.app')
on conflict (clave) do nothing;

create or replace function public.secreto_tareas_valido(p_secreto text)
returns boolean language sql stable security definer set search_path = '' as $$
    select coalesce(length(p_secreto) >= 32 and p_secreto = (select valor from public.ajustes_privados where clave = 'tareas_secreto'), false)
$$;

-- Las hojas de Google a las que les toca actualizarse (y las marca para no repetirlas en la misma vuelta).
create or replace function public.google_pendientes(p_secreto text, p_maximo integer default 10)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v jsonb;
begin
    if not public.secreto_tareas_valido(p_secreto) then
        raise exception 'No autorizado' using errcode = '42501';
    end if;
    with tocan as (
        select i.id from public.inventarios i
        where i.origen ->> 'tipo' = 'google'
          and coalesce((i.estado ->> 'intento')::timestamptz, 'epoch'::timestamptz)
              < now() - make_interval(mins => greatest(15, coalesce((i.origen ->> 'cada_min')::int, 60))) + interval '1 minute'
        order by coalesce((i.estado ->> 'intento')::timestamptz, 'epoch'::timestamptz)
        limit least(greatest(coalesce(p_maximo, 10), 1), 50)
        for update skip locked
    ), marcadas as (
        update public.inventarios i set estado = i.estado || jsonb_build_object('intento', now())
        from tocan where i.id = tocan.id
        returning i.id, i.origen
    )
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'origen', origen)), '[]'::jsonb) into v from marcadas;
    return v;
end $$;

create or replace function public.google_aplicar(p_secreto text, p_inventario uuid, p_lote uuid, p_productos jsonb,
                                                 p_fin boolean, p_error text default null)
returns integer language plpgsql security definer set search_path = '' as $$
begin
    if not public.secreto_tareas_valido(p_secreto) then
        raise exception 'No autorizado' using errcode = '42501';
    end if;
    if not exists (select 1 from public.inventarios where id = p_inventario and origen ->> 'tipo' = 'google') then
        raise exception 'Ese inventario no es de Google' using errcode = '22023';
    end if;
    if p_error is not null then
        perform public.anotar_error_fuente(p_inventario, p_error);
        return 0;
    end if;
    return public.recibir_parte(p_inventario, p_lote, p_productos, p_fin);
end $$;

-- ---------------------------------------------------------------- conectores de SQL Server
-- Cada conector tiene su clave (se muestra una sola vez al crearlo; aquí solo queda su huella) y llena los
-- inventarios del negocio que lo eligieron como origen. Se puede quitar en cualquier momento.
create table if not exists public.conectores (
    id uuid primary key default gen_random_uuid(),
    negocio_id uuid not null references public.negocios(id) on delete cascade,
    nombre text not null check (length(btrim(nombre)) between 1 and 60),
    huella bytea not null unique,
    creado timestamptz not null default now(),
    creado_por uuid references auth.users(id) on delete set null,
    visto timestamptz,
    version text,
    equipo text,
    error text
);
create index if not exists conectores_negocio_idx on public.conectores (negocio_id);
alter table public.conectores enable row level security;
revoke all on public.conectores from anon, authenticated;
grant select (id, negocio_id, nombre, creado, visto, version, equipo, error) on public.conectores to authenticated;
drop policy if exists conectores_ver on public.conectores;
create policy conectores_ver on public.conectores for select to authenticated using (public.administra(negocio_id));

create or replace function public.crear_conector(p_negocio uuid, p_nombre text)
returns text language plpgsql security definer set search_path = '' as $$
declare
    v_clave text := 'pzc_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
    if not public.administra(p_negocio) then
        raise exception 'Solo el dueño o un administrador crean conectores' using errcode = '42501';
    end if;
    if (select count(*) from public.conectores where negocio_id = p_negocio) >= 10 then
        raise exception 'Máximo 10 conectores por negocio' using errcode = '54000';
    end if;
    insert into public.conectores (negocio_id, nombre, huella, creado_por)
    values (p_negocio, coalesce(nullif(left(btrim(coalesce(p_nombre, '')), 60), ''), 'Conector'),
            public.huella_de(v_clave), auth.uid());
    return v_clave;   -- única vez que se ve
end $$;

create or replace function public.quitar_conector(p_conector uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
    v_negocio uuid;
begin
    select negocio_id into v_negocio from public.conectores where id = p_conector;
    if v_negocio is null or not public.administra(v_negocio) then
        raise exception 'No puedes quitar este conector' using errcode = '42501';
    end if;
    delete from public.conectores where id = p_conector;
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
    return v;
end $$;

-- El conector se presenta: qué inventarios le toca llenar. Anota versión, equipo y último error.
create or replace function public.conector_estado(p_clave text, p_version text default null,
                                                  p_equipo text default null, p_error text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v public.conectores := public.conector_de_clave(p_clave);
begin
    update public.conectores
    set visto = now(), version = left(p_version, 40), equipo = left(p_equipo, 80), error = left(p_error, 300)
    where id = v.id;
    return jsonb_build_object(
        'conector', jsonb_build_object('id', v.id, 'nombre', v.nombre),
        'negocio', (select jsonb_build_object('nombre', n.nombre) from public.negocios n where n.id = v.negocio_id),
        'inventarios', coalesce((
            select jsonb_agg(jsonb_build_object('id', i.id, 'nombre', i.nombre, 'estado', i.estado) order by i.nombre)
            from public.inventarios i
            where i.negocio_id = v.negocio_id and i.origen ->> 'tipo' = 'conector'
              and i.origen ->> 'conector_id' = v.id::text), '[]'::jsonb));
end $$;

create or replace function public.conector_subir(p_clave text, p_inventario uuid, p_lote uuid, p_productos jsonb,
                                                 p_fin boolean, p_error text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
    v public.conectores := public.conector_de_clave(p_clave);
begin
    -- Solo inventarios de SU negocio que lo eligieron como origen.
    if not exists (select 1 from public.inventarios i where i.id = p_inventario and i.negocio_id = v.negocio_id
                   and i.origen ->> 'tipo' = 'conector' and i.origen ->> 'conector_id' = v.id::text) then
        raise exception 'Este conector no llena ese inventario' using errcode = '42501';
    end if;
    if p_error is not null then
        perform public.anotar_error_fuente(p_inventario, p_error);
        return 0;
    end if;
    return public.recibir_parte(p_inventario, p_lote, p_productos, p_fin);
end $$;

-- ---------------------------------------------------------------- permisos
revoke all on function public.recibir_parte(uuid, uuid, jsonb, boolean), public.anotar_error_fuente(uuid, text),
                       public.cargar_inventario(uuid, uuid, jsonb, boolean, text), public.secreto_tareas_valido(text),
                       public.google_pendientes(text, integer), public.google_aplicar(text, uuid, uuid, jsonb, boolean, text),
                       public.crear_conector(uuid, text), public.quitar_conector(uuid), public.conector_de_clave(text),
                       public.conector_estado(text, text, text, text), public.conector_subir(text, uuid, uuid, jsonb, boolean, text)
    from public, anon, authenticated;
grant execute on function public.cargar_inventario(uuid, uuid, jsonb, boolean, text), public.crear_conector(uuid, text),
                          public.quitar_conector(uuid)
    to authenticated;
-- Sin sesión, con su clave: la tarea programada (Google) y el conector.
grant execute on function public.google_pendientes(text, integer), public.google_aplicar(text, uuid, uuid, jsonb, boolean, text),
                          public.conector_estado(text, text, text, text), public.conector_subir(text, uuid, uuid, jsonb, boolean, text)
    to anon, authenticated;

-- ---------------------------------------------------------------- tarea cada 15 minutos (pg_cron + pg_net)
-- Supabase trae ambas extensiones. Si no se pueden activar, todo lo demás funciona igual y el botón
-- «Actualizar ahora» del panel sigue disponible.
do $outer$
begin
    create extension if not exists pg_cron;
    create extension if not exists pg_net with schema extensions;
    perform cron.unschedule(jobid) from cron.job where jobname = 'prezio-google';
    perform cron.schedule('prezio-google', '*/15 * * * *', $job$
        select net.http_post(
            url := (select valor from public.ajustes_privados where clave = 'sitio') || '/api/tareas/google',
            headers := jsonb_build_object('Content-Type', 'application/json',
                                          'x-prezio-tareas', (select valor from public.ajustes_privados where clave = 'tareas_secreto')),
            body := '{}'::jsonb,
            timeout_milliseconds := 60000)
    $job$);
    raise notice 'Tarea programada «prezio-google» activa (cada 15 minutos).';
exception when others then
    raise notice 'No se pudo programar la tarea de Google (%). Activa pg_cron y pg_net en Database › Extensions y vuelve a ejecutar este archivo.', sqlerrm;
end $outer$;
