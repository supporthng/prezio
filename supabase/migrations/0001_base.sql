-- =====================================================================
-- Prezio · 0001 · Base para varios negocios
--
-- Cada fila de datos lleva su negocio_id. Las reglas de acceso (RLS) dejan a cada
-- usuario ver y cambiar SOLO los negocios de los que es miembro, según su rol:
--   dueno       todo, incluido invitar administradores y borrar el negocio
--   admin       todo menos la suscripción y los dueños
--   encargado   ve su negocio; cambia solo los datos de SU sucursal
--   verificador solo consulta precios
-- El plan y la suscripción solo los cambia Prezio (clave de servidor), nunca el cliente.
--
-- Ejecutar en Supabase › SQL Editor (proyecto NUEVO de Prezio). Idempotente.
-- =====================================================================

create extension if not exists pgcrypto;

do $$ begin
    create type public.rol_negocio as enum ('dueno', 'admin', 'encargado', 'verificador');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- perfiles
-- Nombre y correo de cada cuenta, para mostrar quién es quién en el equipo de un negocio.
create table if not exists public.perfiles (
    id uuid primary key references auth.users(id) on delete cascade,
    nombre text not null default '' check (length(nombre) <= 80),
    correo text not null default ''
);

create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    insert into public.perfiles (id, nombre, correo)
    values (new.id, left(coalesce(new.raw_user_meta_data ->> 'nombre', ''), 80), lower(coalesce(new.email, '')))
    on conflict (id) do update set correo = excluded.correo;
    return new;
end $$;
drop trigger if exists crear_perfil_al_registrarse on auth.users;
create trigger crear_perfil_al_registrarse after insert on auth.users
    for each row execute function public.crear_perfil();

-- ---------------------------------------------------------------- negocios
create table if not exists public.negocios (
    id uuid primary key default gen_random_uuid(),
    nombre text not null check (length(btrim(nombre)) between 2 and 80),
    slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
    plan text not null default 'prueba' check (plan in ('prueba', 'basico', 'profesional', 'suspendido')),
    prueba_hasta timestamptz not null default (now() + interval '30 days'),
    moneda text not null default 'RD$' check (length(moneda) between 1 and 6),
    apariencia jsonb not null default '{}'::jsonb,
    creado_por uuid references auth.users(id) on delete set null,
    creado timestamptz not null default now()
);

-- ---------------------------------------------------------------- sucursales
-- La Principal es una sucursal más (es_principal = true): una por negocio, no se borra.
create table if not exists public.sucursales (
    id uuid primary key default gen_random_uuid(),
    negocio_id uuid not null references public.negocios(id) on delete cascade,
    codigo text not null check (codigo ~ '^[a-z0-9][a-z0-9-]{1,29}$'),
    nombre text not null check (length(btrim(nombre)) between 1 and 80),
    es_principal boolean not null default false,
    activa boolean not null default true,
    geo_activa boolean not null default false,
    latitud double precision check (latitud between -90 and 90),
    longitud double precision check (longitud between -180 and 180),
    radio_m integer not null default 100 check (radio_m between 10 and 10000),
    -- {"tipo":"inventario","inventario_id":"…"} | {"tipo":"google",…} | {"tipo":"sql","fuente_id":"…"}
    fuente jsonb not null default '{}'::jsonb,
    creado timestamptz not null default now(),
    unique (negocio_id, codigo),
    unique (id, negocio_id)
);
create unique index if not exists sucursales_una_principal
    on public.sucursales (negocio_id) where es_principal;

-- ---------------------------------------------------------------- miembros
create table if not exists public.miembros (
    negocio_id uuid not null references public.negocios(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    rol public.rol_negocio not null,
    sucursal_id uuid,
    creado timestamptz not null default now(),
    primary key (negocio_id, user_id),
    foreign key (sucursal_id, negocio_id) references public.sucursales(id, negocio_id) on delete set null (sucursal_id),
    check (rol <> 'encargado' or sucursal_id is not null)
);
create index if not exists miembros_usuario_idx on public.miembros (user_id);

-- ---------------------------------------------------------------- invitaciones
create table if not exists public.invitaciones (
    id uuid primary key default gen_random_uuid(),
    negocio_id uuid not null references public.negocios(id) on delete cascade,
    correo text not null check (correo = lower(btrim(correo)) and correo like '%_@_%'),
    rol public.rol_negocio not null check (rol <> 'dueno'),
    sucursal_id uuid,
    token uuid not null unique default gen_random_uuid(),
    invitado_por uuid references auth.users(id) on delete set null,
    creada timestamptz not null default now(),
    expira timestamptz not null default (now() + interval '7 days'),
    aceptada timestamptz,
    foreign key (sucursal_id, negocio_id) references public.sucursales(id, negocio_id) on delete cascade,
    check (rol <> 'encargado' or sucursal_id is not null)
);

-- ---------------------------------------------------------------- inventarios y productos
create table if not exists public.inventarios (
    id uuid primary key default gen_random_uuid(),
    negocio_id uuid not null references public.negocios(id) on delete cascade,
    nombre text not null check (length(btrim(nombre)) between 1 and 80),
    creado timestamptz not null default now(),
    actualizado timestamptz not null default now(),
    unique (negocio_id, nombre),
    unique (id, negocio_id)
);

create table if not exists public.productos (
    inventario_id uuid not null,
    negocio_id uuid not null,
    codigo text not null check (length(codigo) between 1 and 64),
    nombre text not null check (length(nombre) between 1 and 200),
    precio numeric(14, 2) not null check (precio >= 0),
    primary key (inventario_id, codigo),
    foreign key (inventario_id, negocio_id) references public.inventarios(id, negocio_id) on delete cascade
);
create index if not exists productos_negocio_idx on public.productos (negocio_id);

-- ---------------------------------------------------------------- registro de consultas
create table if not exists public.consultas (
    id bigint generated always as identity primary key,
    negocio_id uuid not null references public.negocios(id) on delete cascade,
    sucursal_id uuid,
    creado timestamptz not null default now(),
    codigo text not null check (length(codigo) between 1 and 64),
    encontrado boolean not null,
    nombre text,
    precio numeric(14, 2),
    canal text not null default 'verificador',
    foreign key (sucursal_id, negocio_id) references public.sucursales(id, negocio_id) on delete set null (sucursal_id)
);
create index if not exists consultas_negocio_fecha_idx on public.consultas (negocio_id, creado desc);

-- =====================================================================
-- Funciones de acceso (security definer: leen miembros sin pasar por su propia RLS)
-- =====================================================================
create or replace function public.rol_en(p_negocio uuid)
returns public.rol_negocio language sql stable security definer set search_path = '' as $$
    select m.rol from public.miembros m where m.negocio_id = p_negocio and m.user_id = auth.uid()
$$;

create or replace function public.es_miembro(p_negocio uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.miembros m where m.negocio_id = p_negocio and m.user_id = auth.uid())
$$;

create or replace function public.administra(p_negocio uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.miembros m
                   where m.negocio_id = p_negocio and m.user_id = auth.uid() and m.rol in ('dueno', 'admin'))
$$;

create or replace function public.encarga(p_negocio uuid, p_sucursal uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.miembros m
                   where m.negocio_id = p_negocio and m.user_id = auth.uid()
                     and m.rol = 'encargado' and m.sucursal_id = p_sucursal)
$$;

-- =====================================================================
-- Reglas de acceso (RLS)
-- =====================================================================
alter table public.negocios enable row level security;
alter table public.sucursales enable row level security;
alter table public.miembros enable row level security;
alter table public.invitaciones enable row level security;
alter table public.inventarios enable row level security;
alter table public.productos enable row level security;
alter table public.consultas enable row level security;
alter table public.perfiles enable row level security;

-- Nadie anónimo toca las tablas (los equipos sin internet leen archivos publicados).
revoke all on public.negocios, public.sucursales, public.miembros, public.invitaciones,
              public.inventarios, public.productos, public.consultas from anon;
revoke all on public.negocios, public.sucursales, public.miembros, public.invitaciones,
              public.inventarios, public.productos, public.consultas from authenticated;

-- perfiles: cada uno ve el suyo y los de quienes comparten un negocio con él; cambia solo su nombre.
revoke all on public.perfiles from anon, authenticated;
grant select on public.perfiles to authenticated;
grant update (nombre) on public.perfiles to authenticated;
drop policy if exists perfiles_ver on public.perfiles;
create policy perfiles_ver on public.perfiles for select to authenticated using (
    id = auth.uid() or exists (
        select 1 from public.miembros yo join public.miembros otro on otro.negocio_id = yo.negocio_id
        where yo.user_id = auth.uid() and otro.user_id = perfiles.id));
drop policy if exists perfiles_editar on public.perfiles;
create policy perfiles_editar on public.perfiles for update to authenticated
    using (id = auth.uid()) with check (id = auth.uid());

-- negocios: los miembros lo ven; dueño y admin cambian nombre, moneda y apariencia (no el plan).
grant select on public.negocios to authenticated;
grant update (nombre, moneda, apariencia) on public.negocios to authenticated;
drop policy if exists negocios_ver on public.negocios;
create policy negocios_ver on public.negocios for select to authenticated using (public.es_miembro(id));
drop policy if exists negocios_editar on public.negocios;
create policy negocios_editar on public.negocios for update to authenticated
    using (public.administra(id)) with check (public.administra(id));

-- sucursales
grant select, insert, delete on public.sucursales to authenticated;
grant update (nombre, activa, geo_activa, latitud, longitud, radio_m, fuente) on public.sucursales to authenticated;
drop policy if exists sucursales_ver on public.sucursales;
create policy sucursales_ver on public.sucursales for select to authenticated using (public.es_miembro(negocio_id));
drop policy if exists sucursales_crear on public.sucursales;
create policy sucursales_crear on public.sucursales for insert to authenticated
    with check (public.administra(negocio_id) and not es_principal);
drop policy if exists sucursales_editar on public.sucursales;
create policy sucursales_editar on public.sucursales for update to authenticated
    using (public.administra(negocio_id) or public.encarga(negocio_id, id))
    with check (public.administra(negocio_id) or public.encarga(negocio_id, id));
drop policy if exists sucursales_borrar on public.sucursales;
create policy sucursales_borrar on public.sucursales for delete to authenticated
    using (public.administra(negocio_id) and not es_principal);

-- miembros: se ven los del propio negocio; los cambios van por funciones (invitar, quitar, cambiar rol).
grant select on public.miembros to authenticated;
drop policy if exists miembros_ver on public.miembros;
create policy miembros_ver on public.miembros for select to authenticated using (public.es_miembro(negocio_id));

-- invitaciones: las ve quien administra el negocio; se crean y aceptan por funciones.
grant select on public.invitaciones to authenticated;
drop policy if exists invitaciones_ver on public.invitaciones;
create policy invitaciones_ver on public.invitaciones for select to authenticated using (public.administra(negocio_id));

-- inventarios y productos: todos los miembros los leen; dueño y admin los cargan.
grant select, insert, update, delete on public.inventarios, public.productos to authenticated;
drop policy if exists inventarios_ver on public.inventarios;
create policy inventarios_ver on public.inventarios for select to authenticated using (public.es_miembro(negocio_id));
drop policy if exists inventarios_escribir on public.inventarios;
create policy inventarios_escribir on public.inventarios for all to authenticated
    using (public.administra(negocio_id)) with check (public.administra(negocio_id));
drop policy if exists productos_ver on public.productos;
create policy productos_ver on public.productos for select to authenticated using (public.es_miembro(negocio_id));
drop policy if exists productos_escribir on public.productos;
create policy productos_escribir on public.productos for all to authenticated
    using (public.administra(negocio_id)) with check (public.administra(negocio_id));

-- consultas: cualquier miembro registra las suyas; dueño y admin ven todas, el encargado las de su sucursal.
grant select, insert on public.consultas to authenticated;
drop policy if exists consultas_ver on public.consultas;
create policy consultas_ver on public.consultas for select to authenticated
    using (public.administra(negocio_id) or public.encarga(negocio_id, sucursal_id));
drop policy if exists consultas_registrar on public.consultas;
create policy consultas_registrar on public.consultas for insert to authenticated
    with check (public.es_miembro(negocio_id));

-- =====================================================================
-- Funciones que usa la app
-- =====================================================================

-- Crear un negocio: quien lo crea queda como dueño y se crea su Principal.
create or replace function public.crear_negocio(p_nombre text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    v_usuario uuid := auth.uid();
    v_nombre text := btrim(coalesce(p_nombre, ''));
    v_base text;
    v_slug text;
    v_id uuid;
    v_n integer := 1;
begin
    if v_usuario is null then
        raise exception 'Inicia sesión para crear un negocio' using errcode = '28000';
    end if;
    if length(v_nombre) < 2 or length(v_nombre) > 80 then
        raise exception 'El nombre del negocio debe tener entre 2 y 80 caracteres' using errcode = '22023';
    end if;
    if (select count(*) from public.negocios where creado_por = v_usuario) >= 5 then
        raise exception 'Ya creaste 5 negocios; escribe a soporte para crear más' using errcode = '54000';
    end if;
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
    insert into public.negocios (nombre, slug, creado_por) values (v_nombre, v_slug, v_usuario)
        returning id into v_id;
    insert into public.miembros (negocio_id, user_id, rol) values (v_id, v_usuario, 'dueno');
    insert into public.sucursales (negocio_id, codigo, nombre, es_principal)
        values (v_id, 'principal', 'Principal', true);
    return v_id;
end $$;

-- Invitar a alguien por correo (dueño o admin; solo un dueño invita administradores).
create or replace function public.invitar(p_negocio uuid, p_correo text, p_rol public.rol_negocio,
                                          p_sucursal uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    v_rol public.rol_negocio := public.rol_en(p_negocio);
    v_token uuid;
begin
    if v_rol is null or v_rol not in ('dueno', 'admin') then
        raise exception 'No tienes permiso para invitar en este negocio' using errcode = '42501';
    end if;
    if p_rol = 'dueno' then
        raise exception 'No se puede invitar a otro dueño' using errcode = '22023';
    end if;
    if p_rol = 'admin' and v_rol <> 'dueno' then
        raise exception 'Solo el dueño puede invitar administradores' using errcode = '42501';
    end if;
    insert into public.invitaciones (negocio_id, correo, rol, sucursal_id, invitado_por)
        values (p_negocio, lower(btrim(p_correo)), p_rol, case when p_rol = 'encargado' then p_sucursal end, auth.uid())
        returning token into v_token;
    return v_token;
end $$;

-- Aceptar una invitación: el correo de la cuenta debe ser el invitado.
create or replace function public.aceptar_invitacion(p_token uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    v_inv public.invitaciones;
    v_correo text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
    if auth.uid() is null then
        raise exception 'Inicia sesión para aceptar la invitación' using errcode = '28000';
    end if;
    select * into v_inv from public.invitaciones where token = p_token for update;
    if not found or v_inv.aceptada is not null or v_inv.expira < now() then
        raise exception 'La invitación no existe, ya se usó o venció' using errcode = '22023';
    end if;
    if v_inv.correo <> v_correo then
        raise exception 'Esta invitación es para otro correo' using errcode = '42501';
    end if;
    insert into public.miembros (negocio_id, user_id, rol, sucursal_id)
        values (v_inv.negocio_id, auth.uid(), v_inv.rol, v_inv.sucursal_id)
        on conflict (negocio_id, user_id) do update
            set rol = excluded.rol, sucursal_id = excluded.sucursal_id
            where public.miembros.rol <> 'dueno';          -- un dueño nunca baja de rol por una invitación
    update public.invitaciones set aceptada = now() where id = v_inv.id;
    return v_inv.negocio_id;
end $$;

-- Quitar a un miembro (el dueño no se puede quitar; un admin no quita a otro admin).
create or replace function public.quitar_miembro(p_negocio uuid, p_usuario uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
    v_yo public.rol_negocio := public.rol_en(p_negocio);
    v_el public.rol_negocio;
begin
    select rol into v_el from public.miembros where negocio_id = p_negocio and user_id = p_usuario;
    if v_el is null then
        return;
    end if;
    if v_yo is null or v_yo not in ('dueno', 'admin') or v_el = 'dueno' or (v_el = 'admin' and v_yo <> 'dueno') then
        raise exception 'No tienes permiso para quitar a esta persona' using errcode = '42501';
    end if;
    delete from public.miembros where negocio_id = p_negocio and user_id = p_usuario;
end $$;

-- Reemplazar todos los productos de un inventario (carga de Excel con «reemplazar todo»).
create or replace function public.reemplazar_productos(p_inventario uuid, p_productos jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
    v_negocio uuid;
    v_n integer;
begin
    select negocio_id into v_negocio from public.inventarios where id = p_inventario;
    if v_negocio is null or not public.administra(v_negocio) then
        raise exception 'No tienes permiso sobre este inventario' using errcode = '42501';
    end if;
    delete from public.productos where inventario_id = p_inventario;
    insert into public.productos (inventario_id, negocio_id, codigo, nombre, precio)
        select distinct on (x.codigo) p_inventario, v_negocio, btrim(x.codigo), btrim(x.nombre), x.precio
        from jsonb_to_recordset(p_productos) as x(codigo text, nombre text, precio numeric)
        where btrim(coalesce(x.codigo, '')) <> '' and btrim(coalesce(x.nombre, '')) <> '' and x.precio >= 0;
    get diagnostics v_n = row_count;
    update public.inventarios set actualizado = now() where id = p_inventario;
    return v_n;
end $$;

revoke all on function public.crear_negocio(text), public.invitar(uuid, text, public.rol_negocio, uuid),
                       public.aceptar_invitacion(uuid), public.quitar_miembro(uuid, uuid),
                       public.reemplazar_productos(uuid, jsonb),
                       public.rol_en(uuid), public.es_miembro(uuid), public.administra(uuid), public.encarga(uuid, uuid)
    from public, anon;
grant execute on function public.crear_negocio(text), public.invitar(uuid, text, public.rol_negocio, uuid),
                          public.aceptar_invitacion(uuid), public.quitar_miembro(uuid, uuid),
                          public.reemplazar_productos(uuid, jsonb),
                          public.rol_en(uuid), public.es_miembro(uuid), public.administra(uuid), public.encarga(uuid, uuid)
    to authenticated;
