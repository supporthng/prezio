-- =====================================================================
-- FUMIO · Actualización 2
-- · Razón social (nombre de facturación) de los clientes
-- · Frecuencia semanal en un día fijo y servicios de una sola vez
-- · Constancia de servicio: empresa, productos, fotos y firma
--
-- Cómo usarlo: en Supabase → SQL Editor, pega TODO este archivo y dale
-- a "Run". Se corre una sola vez, después de 01_esquema.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Clientes: nombre comercial y razón social
-- ---------------------------------------------------------------------
alter table clientes add column if not exists razon_social text;
comment on column clientes.nombre is 'Nombre comercial (como se conoce el negocio)';
comment on column clientes.razon_social is 'Nombre de facturación (razón social)';

-- ---------------------------------------------------------------------
-- 0.1 Frecuencias: semanal en un día fijo y servicio de una sola vez
--     dia_semana: 1 = lunes … 7 = domingo
-- ---------------------------------------------------------------------
alter type unidad_frecuencia add value if not exists 'unica';
alter table sucursales add column if not exists dia_semana int check (dia_semana between 1 and 7);

drop function if exists primera_fecha(date, unidad_frecuencia, int);
create or replace function primera_fecha(p_inicio date, p_unidad unidad_frecuencia, p_dia_mes int, p_dia_semana int default null)
returns date language plpgsql immutable as $$
declare
  v date;
begin
  if p_unidad::text = 'semanas' and p_dia_semana is not null then
    return p_inicio + ((p_dia_semana - extract(isodow from p_inicio)::int + 7) % 7);
  end if;
  if p_unidad::text <> 'meses' or p_dia_mes is null then
    return p_inicio;
  end if;
  v := fecha_en_mes(p_inicio, p_dia_mes);
  if v < p_inicio then
    v := fecha_en_mes((date_trunc('month', p_inicio) + interval '1 month')::date, p_dia_mes);
  end if;
  return v;
end $$;

create or replace function generar_visitas(p_hasta date)
returns int language plpgsql security definer set search_path = public as $$
declare
  s record;
  v_fecha date;
  v_total int := 0;
  v_n int;
begin
  if not es_oficina() then
    raise exception 'Solo la oficina puede generar visitas';
  end if;
  if p_hasta > current_date + 400 then
    raise exception 'Genera como máximo un año hacia adelante';
  end if;

  for s in
    select su.*, coalesce(su.precio, se.precio_base) as precio_final
    from sucursales su
    join clientes c on c.id = su.cliente_id and c.activo
    left join servicios se on se.id = su.servicio_id
    where su.activa
  loop
    select max(fecha) into v_fecha
    from visitas where sucursal_id = s.id and origen = 'frecuencia';

    if v_fecha is null then
      v_fecha := primera_fecha(s.fecha_inicio, s.frecuencia_unidad, s.dia_mes, s.dia_semana);
    elsif s.frecuencia_unidad::text = 'unica' then
      continue; -- servicio de una sola vez: ya tiene su visita
    else
      v_fecha := siguiente_fecha(v_fecha, s.frecuencia_unidad, s.frecuencia_cada, s.dia_mes);
    end if;

    while v_fecha <= p_hasta loop
      insert into visitas (sucursal_id, servicio_id, tecnico_id, fecha, precio, origen, actualizado_por)
      values (s.id, s.servicio_id, s.tecnico_id, v_fecha, s.precio_final, 'frecuencia', auth.uid())
      on conflict do nothing;
      get diagnostics v_n = row_count;
      v_total := v_total + v_n;
      exit when s.frecuencia_unidad::text = 'unica';
      v_fecha := siguiente_fecha(v_fecha, s.frecuencia_unidad, s.frecuencia_cada, s.dia_mes);
    end loop;
  end loop;

  return v_total;
end $$;

-- ---------------------------------------------------------------------
-- 0.2 Asignación de columnas guardada para importar desde Excel/CSV
-- ---------------------------------------------------------------------
create table if not exists mapeos_importacion (
  tipo            text primary key,   -- clientes, servicios, productos
  mapeo           jsonb not null,     -- campo de Fumio → columna del archivo
  actualizado_en  timestamptz not null default now()
);
alter table mapeos_importacion enable row level security;
drop policy if exists mapeos_ofi on mapeos_importacion;
create policy mapeos_ofi on mapeos_importacion for all to authenticated
  using (es_oficina()) with check (es_oficina());

-- ---------------------------------------------------------------------
-- 1. Datos de la empresa (encabezado de la constancia)
-- ---------------------------------------------------------------------
create table if not exists empresa (
  id              int primary key default 1 check (id = 1),
  nombre          text not null default 'Mi empresa de fumigación',
  rnc             text,
  telefono        text,
  whatsapp        text,
  correo          text,
  direccion       text,
  licencia        text,   -- permiso / registro sanitario
  pie_constancia  text    -- texto al final de la constancia
);
insert into empresa (id) values (1) on conflict do nothing;

alter table empresa enable row level security;
drop policy if exists empresa_ver on empresa;
create policy empresa_ver on empresa for select to authenticated using (true);
drop policy if exists empresa_ofi on empresa;
create policy empresa_ofi on empresa for update to authenticated using (es_oficina()) with check (es_oficina());

-- ---------------------------------------------------------------------
-- 2. Catálogo de productos (químicos e insumos)
-- ---------------------------------------------------------------------
create table if not exists productos (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null unique,
  ingrediente_activo text,
  unidad             text not null default 'ml',
  registro           text,   -- registro sanitario del producto
  activo             boolean not null default true
);
alter table productos enable row level security;
drop policy if exists productos_ver on productos;
create policy productos_ver on productos for select to authenticated using (true);
drop policy if exists productos_ofi on productos;
create policy productos_ofi on productos for all to authenticated using (es_oficina()) with check (es_oficina());

-- ---------------------------------------------------------------------
-- 3. Constancias (una por visita realizada)
-- ---------------------------------------------------------------------
create table if not exists constancias (
  visita_id       uuid primary key references visitas (id) on delete cascade,
  token           uuid not null unique,          -- enlace público para el cliente
  recibido_por    text,
  recibido_cargo  text,
  plagas          text[] not null default '{}',
  areas           text,
  productos       jsonb not null default '[]',   -- [{producto_id, nombre, ingrediente_activo, cantidad, unidad}]
  fotos           text[] not null default '{}',  -- rutas en el almacenamiento
  firma           text,                          -- ruta de la imagen de la firma
  creado_por      uuid references perfiles (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
alter table constancias enable row level security;
drop policy if exists constancias_ofi on constancias;
create policy constancias_ofi on constancias for all to authenticated
  using (es_oficina()) with check (es_oficina());
drop policy if exists constancias_tec on constancias;
create policy constancias_tec on constancias for select to authenticated
  using (exists (select 1 from visitas v where v.id = constancias.visita_id and v.tecnico_id = auth.uid()));

-- Guardar (o completar) la constancia. Idempotente: la app sin internet
-- puede mandarla varias veces. El enlace (token) no cambia nunca.
create or replace function guardar_constancia(p_visita uuid, p_token uuid, p_datos jsonb)
returns constancias language plpgsql security definer set search_path = public as $$
declare
  v visitas;
  c constancias;
  v_productos jsonb;
begin
  select * into v from visitas where id = p_visita;
  if not found then
    raise exception 'La visita no existe';
  end if;
  if not (es_oficina() or (mi_rol() = 'tecnico' and v.tecnico_id = auth.uid())) then
    raise exception 'No tienes permiso sobre esta visita';
  end if;
  if v.estado <> 'realizada' then
    raise exception 'La constancia solo se hace para servicios realizados';
  end if;

  -- Copia del nombre del producto al momento del servicio
  select coalesce(jsonb_agg(jsonb_build_object(
           'producto_id', p.id,
           'nombre', p.nombre,
           'ingrediente_activo', p.ingrediente_activo,
           'registro', p.registro,
           'cantidad', nullif(x ->> 'cantidad', ''),
           'unidad', coalesce(nullif(x ->> 'unidad', ''), p.unidad)
         ) order by p.nombre), '[]'::jsonb)
    into v_productos
  from jsonb_array_elements(coalesce(p_datos -> 'productos', '[]'::jsonb)) x
  join productos p on p.id = (x ->> 'producto_id')::uuid;

  insert into constancias as k (visita_id, token, recibido_por, recibido_cargo, plagas, areas, productos, fotos, firma, creado_por)
  values (
    p_visita,
    p_token,
    nullif(p_datos ->> 'recibido_por', ''),
    nullif(p_datos ->> 'recibido_cargo', ''),
    coalesce(array(select jsonb_array_elements_text(p_datos -> 'plagas')), '{}'),
    nullif(p_datos ->> 'areas', ''),
    v_productos,
    coalesce(array(select jsonb_array_elements_text(p_datos -> 'fotos')), '{}'),
    nullif(p_datos ->> 'firma', ''),
    auth.uid()
  )
  on conflict (visita_id) do update set
    recibido_por   = excluded.recibido_por,
    recibido_cargo = excluded.recibido_cargo,
    plagas         = excluded.plagas,
    areas          = excluded.areas,
    productos      = excluded.productos,
    fotos          = excluded.fotos,
    firma          = excluded.firma,
    actualizado_en = now()
  returning * into c;
  return c;
end $$;

revoke execute on function guardar_constancia(uuid, uuid, jsonb) from public, anon;
grant  execute on function guardar_constancia(uuid, uuid, jsonb) to authenticated;

-- Datos para la página pública de la constancia (la abre el cliente sin
-- usuario, con el enlace). Solo devuelve la constancia de ese enlace.
create or replace function constancia_publica(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'token', k.token,
    'numero', upper(substr(replace(k.token::text, '-', ''), 1, 8)),
    'recibido_por', k.recibido_por,
    'recibido_cargo', k.recibido_cargo,
    'plagas', to_jsonb(k.plagas),
    'areas', k.areas,
    'productos', k.productos,
    'fotos', to_jsonb(k.fotos),
    'firma', k.firma,
    'fecha', v.fecha,
    'realizada_en', v.realizada_en,
    'notas', v.notas_tecnico,
    'cliente', c.nombre,
    'razon_social', c.razon_social,
    'cliente_rnc', c.rnc,
    'sucursal', su.nombre,
    'direccion', su.direccion,
    'zona', z.nombre,
    'region', r.nombre,
    'servicio', se.nombre,
    'tecnico', p.nombre,
    'garantia_vence', g.vence,
    'empresa', (select to_jsonb(e) - 'id' from empresa e where e.id = 1)
  )
  from constancias k
  join visitas v          on v.id = k.visita_id
  join sucursales su      on su.id = v.sucursal_id
  join clientes c         on c.id = su.cliente_id
  left join zonas z       on z.id = su.zona_id
  left join regiones r    on r.id = z.region_id
  left join servicios se  on se.id = v.servicio_id
  left join perfiles p    on p.id = v.tecnico_id
  left join garantias g   on g.visita_id = v.id
  where k.token = p_token
    and v.estado = 'realizada'
$$;

grant execute on function constancia_publica(uuid) to anon, authenticated;

-- Para mostrar el botón "Constancia" en las rutas
create or replace view visitas_constancia with (security_invoker = true) as
select visita_id, token, firma is not null as firmada, cardinality(fotos) as fotos
from constancias;

-- ---------------------------------------------------------------------
-- 4. Almacenamiento de fotos y firmas (privado)
--    Ruta de cada archivo: <id de la visita>/<nombre>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('constancias', 'constancias', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function puede_usar_archivo(p_nombre text) returns boolean
language sql stable security definer set search_path = public as $$
  select es_oficina() or exists (
    select 1 from visitas v
    where v.id::text = split_part(p_nombre, '/', 1)
      and v.tecnico_id = auth.uid()
  )
$$;

drop policy if exists constancias_subir on storage.objects;
create policy constancias_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'constancias' and puede_usar_archivo(name));
drop policy if exists constancias_reemplazar on storage.objects;
create policy constancias_reemplazar on storage.objects for update to authenticated
  using (bucket_id = 'constancias' and puede_usar_archivo(name))
  with check (bucket_id = 'constancias' and puede_usar_archivo(name));
drop policy if exists constancias_leer on storage.objects;
create policy constancias_leer on storage.objects for select to authenticated
  using (bucket_id = 'constancias' and puede_usar_archivo(name));
drop policy if exists constancias_borrar on storage.objects;
create policy constancias_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'constancias' and es_oficina());
