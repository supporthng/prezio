-- =====================================================================
-- FUMIO · Actualización 3: Facturación
-- · Secuencias de comprobantes: NCF serie B (B01, B02, B04, B14, B15…)
--   y e-NCF serie E (E31, E32, E33, E34, E44, E45)
-- · Proformas, facturas y notas de crédito
-- · Facturar los servicios realizados (una factura por cliente)
--
-- Cómo usarlo: Supabase → SQL Editor → pega TODO → Run.
-- Se corre una sola vez, después de 02_actualizacion.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tipos de comprobante fiscal
-- ---------------------------------------------------------------------
create table if not exists tipos_comprobante (
  codigo       text primary key,          -- B01, E31…
  nombre       text not null,
  serie        char(1) not null check (serie in ('B', 'E')),
  es_nota_credito boolean not null default false,
  requiere_rnc boolean not null default false  -- el comprador debe tener RNC o cédula
);

insert into tipos_comprobante (codigo, nombre, serie, es_nota_credito, requiere_rnc) values
  ('B01', 'Factura de crédito fiscal', 'B', false, true),
  ('B02', 'Factura de consumo', 'B', false, false),
  ('B03', 'Nota de débito', 'B', false, true),
  ('B04', 'Nota de crédito', 'B', true, false),
  ('B14', 'Regímenes especiales', 'B', false, true),
  ('B15', 'Gubernamental', 'B', false, true),
  ('E31', 'Factura de crédito fiscal electrónica', 'E', false, true),
  ('E32', 'Factura de consumo electrónica', 'E', false, false),
  ('E33', 'Nota de débito electrónica', 'E', false, true),
  ('E34', 'Nota de crédito electrónica', 'E', true, false),
  ('E44', 'Regímenes especiales electrónica', 'E', false, true),
  ('E45', 'Gubernamental electrónica', 'E', false, true)
on conflict (codigo) do nothing;

alter table tipos_comprobante enable row level security;
drop policy if exists tipos_ver on tipos_comprobante;
create policy tipos_ver on tipos_comprobante for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- 2. Secuencias autorizadas por la DGII
--    Serie B: B + tipo (2) + 8 dígitos = 11 caracteres (B0100000001)
--    Serie E: E + tipo (2) + 10 dígitos = 13 caracteres (E310000000001)
-- ---------------------------------------------------------------------
create table if not exists secuencias (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null references tipos_comprobante (codigo),
  desde       bigint not null check (desde > 0),
  hasta       bigint not null,
  siguiente   bigint not null,
  vence       date,
  activa      boolean not null default true,
  creado_en   timestamptz not null default now(),
  check (hasta >= desde),
  check (siguiente between desde and hasta + 1)
);

alter table secuencias enable row level security;
drop policy if exists secuencias_ofi on secuencias;
create policy secuencias_ofi on secuencias for all to authenticated using (es_oficina()) with check (es_oficina());

create or replace function formatear_ncf(p_tipo text, p_numero bigint) returns text
language sql immutable as $$
  select case left(p_tipo, 1)
    when 'B' then p_tipo || lpad(p_numero::text, 8, '0')
    else p_tipo || lpad(p_numero::text, 10, '0')
  end
$$;

-- Toma el siguiente número de la secuencia vigente (bloquea la fila: dos
-- facturas al mismo tiempo nunca reciben el mismo número)
create or replace function tomar_ncf(p_tipo text, p_fecha date)
returns text language plpgsql security definer set search_path = public as $$
declare
  s secuencias;
begin
  select * into s from secuencias
  where tipo = p_tipo and activa and siguiente <= hasta
    and (vence is null or vence >= p_fecha)
  order by vence nulls last, desde
  limit 1
  for update;
  if not found then
    raise exception 'No hay una secuencia % vigente con números disponibles. Regístrala en Facturación → Secuencias.', p_tipo;
  end if;
  update secuencias set siguiente = siguiente + 1 where id = s.id;
  return formatear_ncf(p_tipo, s.siguiente);
end $$;

create or replace view secuencias_estado with (security_invoker = true) as
select
  s.*,
  t.nombre,
  t.serie,
  formatear_ncf(s.tipo, s.desde) as primero,
  formatear_ncf(s.tipo, s.hasta) as ultimo,
  (s.hasta - s.siguiente + 1) as disponibles,
  case
    when not s.activa then 'inactiva'
    when s.siguiente > s.hasta then 'agotada'
    when s.vence is not null and s.vence < current_date then 'vencida'
    when (s.hasta - s.siguiente + 1) <= greatest(10, (s.hasta - s.desde + 1) / 10)
      or (s.vence is not null and s.vence <= current_date + 30) then 'por_agotarse'
    else 'vigente'
  end as estado
from secuencias s
join tipos_comprobante t on t.codigo = s.tipo;

-- ---------------------------------------------------------------------
-- 3. Datos de facturación del cliente
-- ---------------------------------------------------------------------
alter table clientes add column if not exists tipo_comprobante text references tipos_comprobante (codigo);
alter table clientes add column if not exists dias_credito int not null default 0 check (dias_credito between 0 and 365);
alter table clientes add column if not exists correo_facturas text;
alter table clientes add column if not exists exento_itbis boolean not null default false;

-- ---------------------------------------------------------------------
-- 4. Documentos: proformas, facturas y notas de crédito
-- ---------------------------------------------------------------------
do $$ begin create type tipo_documento as enum ('proforma', 'factura', 'nota_credito'); exception when duplicate_object then null; end $$;
do $$ begin create type estado_documento as enum ('borrador', 'emitida', 'anulada'); exception when duplicate_object then null; end $$;
do $$ begin create type estado_ecf as enum ('no_aplica', 'pendiente', 'enviado', 'aceptado', 'condicional', 'rechazado'); exception when duplicate_object then null; end $$;

create sequence if not exists proformas_numero;

create table if not exists facturas (
  id               uuid primary key default gen_random_uuid(),
  tipo_doc         tipo_documento not null default 'factura',
  tipo_ncf         text references tipos_comprobante (codigo),   -- null en proformas
  ncf              text unique,                                   -- se asigna al emitir
  ncf_vence        date,                                          -- vencimiento de la secuencia usada
  numero_proforma  text unique,
  cliente_id       uuid not null references clientes (id),
  -- copia de los datos del cliente al emitir (la factura no cambia si después se edita el cliente)
  cliente_nombre   text,
  razon_social     text,
  rnc              text,
  fecha            date not null default current_date,
  vence            date,
  dias_credito     int not null default 0,
  estado           estado_documento not null default 'borrador',
  estado_ecf       estado_ecf not null default 'no_aplica',
  ecf_mensaje      text,
  referencia_id    uuid references facturas (id),    -- nota de crédito → factura que modifica
  proforma_id      uuid references facturas (id),    -- factura creada desde una proforma
  subtotal         numeric(14,2) not null default 0,
  descuento        numeric(14,2) not null default 0,
  itbis            numeric(14,2) not null default 0,
  total            numeric(14,2) not null default 0,
  notas            text,
  motivo_anulacion text,
  token            uuid not null unique default gen_random_uuid(),  -- enlace para el cliente
  creado_por       uuid references perfiles (id),
  creado_en        timestamptz not null default now(),
  emitida_en       timestamptz,
  anulada_en       timestamptz,
  check (tipo_doc <> 'nota_credito' or referencia_id is not null)
);
create index if not exists facturas_cliente_id_idx on facturas (cliente_id);
create index if not exists facturas_fecha_idx on facturas (fecha);
create index if not exists facturas_estado_idx on facturas (estado);

create table if not exists factura_lineas (
  id           uuid primary key default gen_random_uuid(),
  factura_id   uuid not null references facturas (id) on delete cascade,
  orden        int not null default 0,
  descripcion  text not null,
  servicio_id  uuid references servicios (id) on delete set null,
  visita_id    uuid references visitas (id) on delete set null,
  cantidad     numeric(12,2) not null default 1 check (cantidad > 0),
  precio       numeric(14,2) not null default 0 check (precio >= 0),
  descuento    numeric(14,2) not null default 0 check (descuento >= 0),
  itbis_tasa   numeric(5,2) not null default 18 check (itbis_tasa in (0, 16, 18)),
  subtotal     numeric(14,2) generated always as (round(cantidad * precio - descuento, 2)) stored,
  itbis        numeric(14,2) generated always as (round((cantidad * precio - descuento) * itbis_tasa / 100, 2)) stored
);
create index if not exists factura_lineas_factura_id_idx on factura_lineas (factura_id);
create index if not exists factura_lineas_visita_id_idx on factura_lineas (visita_id);

-- Visita facturada: en qué factura quedó
alter table visitas add column if not exists factura_id uuid references facturas (id) on delete set null;

-- Totales siempre al día
create or replace function recalcular_factura(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update facturas f set
    subtotal  = coalesce(x.bruto, 0),
    descuento = coalesce(x.desc, 0),
    itbis     = coalesce(x.itbis, 0),
    total     = coalesce(x.neto, 0) + coalesce(x.itbis, 0)
  from (
    select sum(round(cantidad * precio, 2)) as bruto, sum(descuento) as desc,
           sum(subtotal) as neto, sum(itbis) as itbis
    from factura_lineas where factura_id = p_id
  ) x
  where f.id = p_id
$$;

create or replace function al_cambiar_linea() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_estado estado_documento;
begin
  select estado into v_estado from facturas where id = coalesce(new.factura_id, old.factura_id);
  if not found then return null; end if;  -- se está borrando el documento completo
  if v_estado <> 'borrador' then
    raise exception 'Solo se pueden cambiar las líneas de un borrador';
  end if;
  perform recalcular_factura(coalesce(new.factura_id, old.factura_id));
  return null;
end $$;

create or replace trigger lineas_totales
  after insert or update or delete on factura_lineas
  for each row execute function al_cambiar_linea();

-- Un documento emitido o anulado ya no se edita (salvo el estado del e-CF y la anulación)
create or replace function proteger_emitida() returns trigger
language plpgsql as $$
begin
  if old.estado <> 'borrador' and current_setting('fumio.permitir', true) is distinct from 'si' then
    if (new.ncf, new.cliente_id, new.fecha, new.total, new.tipo_ncf, new.tipo_doc)
       is distinct from (old.ncf, old.cliente_id, old.fecha, old.total, old.tipo_ncf, old.tipo_doc) then
      raise exception 'Un documento emitido no se modifica. Anúlalo o haz una nota de crédito.';
    end if;
  end if;
  return new;
end $$;

create or replace trigger facturas_protegidas
  before update on facturas
  for each row execute function proteger_emitida();

-- ---------------------------------------------------------------------
-- 5. Emitir, anular, nota de crédito y convertir proforma
-- ---------------------------------------------------------------------
create or replace function emitir_documento(p_id uuid)
returns facturas language plpgsql security definer set search_path = public as $$
declare
  f facturas;
  c clientes;
  t tipos_comprobante;
  v_lineas int;
  v_vence date;
  ref facturas;
begin
  if not es_oficina() then raise exception 'Solo la oficina puede emitir'; end if;
  select * into f from facturas where id = p_id for update;
  if not found then raise exception 'El documento no existe'; end if;
  if f.estado <> 'borrador' then return f; end if;  -- ya emitido: no hace nada
  select count(*) into v_lineas from factura_lineas where factura_id = p_id;
  if v_lineas = 0 then raise exception 'Agrega al menos una línea antes de emitir'; end if;
  select * into c from clientes where id = f.cliente_id;

  perform set_config('fumio.permitir', 'si', true);

  if f.tipo_doc = 'proforma' then
    update facturas set
      estado = 'emitida',
      numero_proforma = 'PRO-' || lpad(nextval('proformas_numero')::text, 5, '0'),
      cliente_nombre = c.nombre, razon_social = coalesce(c.razon_social, c.nombre), rnc = c.rnc,
      vence = coalesce(vence, fecha + 15),
      emitida_en = now()
    where id = p_id returning * into f;
    return f;
  end if;

  if f.tipo_ncf is null then raise exception 'Elige el tipo de comprobante'; end if;
  select * into t from tipos_comprobante where codigo = f.tipo_ncf;
  if f.tipo_doc = 'nota_credito' and not t.es_nota_credito then
    raise exception 'Una nota de crédito usa B04 o E34';
  end if;
  if f.tipo_doc = 'factura' and t.es_nota_credito then
    raise exception 'B04 y E34 son solo para notas de crédito';
  end if;
  if t.requiere_rnc and coalesce(trim(c.rnc), '') = '' then
    raise exception 'El comprobante % requiere el RNC o la cédula del cliente. Agrégalo en su ficha.', f.tipo_ncf;
  end if;
  if f.tipo_doc = 'factura' and exists (
    select 1 from factura_lineas l join visitas v on v.id = l.visita_id
    where l.factura_id = p_id and v.factura_id is not null and v.factura_id <> p_id
  ) then
    raise exception 'Uno de los servicios de esta factura ya está facturado en otra. Quítalo y vuelve a emitir.';
  end if;
  if f.tipo_doc = 'nota_credito' then
    select * into ref from facturas where id = f.referencia_id;
    if ref.estado <> 'emitida' or ref.tipo_doc <> 'factura' then
      raise exception 'La nota de crédito debe modificar una factura emitida';
    end if;
    if f.total > ref.total then
      raise exception 'La nota de crédito no puede ser mayor que la factura';
    end if;
  end if;

  select vence into v_vence from secuencias
  where tipo = f.tipo_ncf and activa and siguiente <= hasta and (vence is null or vence >= f.fecha)
  order by vence nulls last, desde limit 1;

  update facturas set
    estado = 'emitida',
    ncf = tomar_ncf(f.tipo_ncf, f.fecha),
    ncf_vence = v_vence,
    estado_ecf = case when t.serie = 'E' then 'pendiente'::estado_ecf else 'no_aplica'::estado_ecf end,
    cliente_nombre = c.nombre,
    razon_social = coalesce(c.razon_social, c.nombre),
    rnc = c.rnc,
    vence = case when f.tipo_doc = 'factura' then f.fecha + f.dias_credito else null end,
    emitida_en = now()
  where id = p_id returning * into f;

  -- Las visitas de las líneas quedan facturadas
  if f.tipo_doc = 'factura' then
    update visitas set factura_id = p_id
    where id in (select visita_id from factura_lineas where factura_id = p_id and visita_id is not null);
  end if;
  return f;
end $$;

create or replace function anular_documento(p_id uuid, p_motivo text)
returns facturas language plpgsql security definer set search_path = public as $$
declare
  f facturas;
begin
  if not es_oficina() then raise exception 'Solo la oficina puede anular'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indica el motivo de la anulación'; end if;
  select * into f from facturas where id = p_id for update;
  if not found then raise exception 'El documento no existe'; end if;
  if f.estado = 'anulada' then return f; end if;
  if f.estado = 'borrador' then raise exception 'Un borrador se borra, no se anula'; end if;
  if f.estado_ecf in ('enviado', 'aceptado', 'condicional') then
    raise exception 'Este e-CF ya fue recibido por la DGII. Para revertirlo emite una nota de crédito (E34).';
  end if;
  if exists (select 1 from facturas n where n.referencia_id = p_id and n.estado = 'emitida') then
    raise exception 'Esta factura tiene notas de crédito emitidas';
  end if;
  perform set_config('fumio.permitir', 'si', true);
  update facturas set estado = 'anulada', motivo_anulacion = p_motivo, anulada_en = now()
  where id = p_id returning * into f;
  update visitas set factura_id = null where factura_id = p_id;  -- se pueden volver a facturar
  return f;
end $$;

-- Nota de crédito (borrador) con las mismas líneas de la factura; se ajustan antes de emitir
create or replace function crear_nota_credito(p_factura uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  f facturas;
  v_id uuid;
begin
  if not es_oficina() then raise exception 'Solo la oficina puede hacer notas de crédito'; end if;
  select * into f from facturas where id = p_factura;
  if not found or f.estado <> 'emitida' or f.tipo_doc <> 'factura' then
    raise exception 'Solo se hace nota de crédito a una factura emitida';
  end if;
  insert into facturas (tipo_doc, tipo_ncf, cliente_id, referencia_id, fecha, notas, creado_por)
  values ('nota_credito', case when left(f.tipo_ncf, 1) = 'E' then 'E34' else 'B04' end,
          f.cliente_id, f.id, current_date, 'Modifica ' || f.ncf, auth.uid())
  returning id into v_id;
  insert into factura_lineas (factura_id, orden, descripcion, servicio_id, cantidad, precio, descuento, itbis_tasa)
  select v_id, orden, descripcion, servicio_id, cantidad, precio, descuento, itbis_tasa
  from factura_lineas where factura_id = p_factura;
  return v_id;
end $$;

-- Factura (borrador) a partir de una proforma
create or replace function proforma_a_factura(p_proforma uuid, p_tipo_ncf text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  p facturas;
  c clientes;
  v_id uuid;
begin
  if not es_oficina() then raise exception 'Solo la oficina puede facturar'; end if;
  select * into p from facturas where id = p_proforma;
  if not found or p.tipo_doc <> 'proforma' or p.estado <> 'emitida' then
    raise exception 'Solo se convierte una proforma emitida';
  end if;
  select id into v_id from facturas where proforma_id = p_proforma and estado <> 'anulada';
  if found then return v_id; end if;  -- ya se convirtió
  select * into c from clientes where id = p.cliente_id;
  insert into facturas (tipo_doc, tipo_ncf, cliente_id, proforma_id, dias_credito, notas, creado_por)
  values ('factura', coalesce(p_tipo_ncf, c.tipo_comprobante, 'B02'), p.cliente_id, p.id, c.dias_credito, p.notas, auth.uid())
  returning id into v_id;
  insert into factura_lineas (factura_id, orden, descripcion, servicio_id, visita_id, cantidad, precio, descuento, itbis_tasa)
  select v_id, orden, descripcion, servicio_id, visita_id, cantidad, precio, descuento, itbis_tasa
  from factura_lineas where factura_id = p_proforma;
  return v_id;
end $$;

-- Servicios realizados sin facturar (para armar las facturas del mes)
create or replace view visitas_por_facturar with (security_invoker = true) as
select v.id, v.fecha, v.precio, v.servicio_id, v.sucursal_id,
       su.nombre as sucursal, su.cliente_id, c.nombre as cliente, se.nombre as servicio,
       c.exento_itbis
from visitas v
join sucursales su on su.id = v.sucursal_id
join clientes c on c.id = su.cliente_id
left join servicios se on se.id = v.servicio_id
where v.estado = 'realizada'
  and v.factura_id is null
  and not exists (
    select 1 from factura_lineas l join facturas f on f.id = l.factura_id
    where l.visita_id = v.id and f.estado = 'borrador'
  );

-- Crea un borrador por cliente con sus servicios realizados del período
create or replace function facturar_periodo(p_desde date, p_hasta date, p_clientes uuid[] default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  c record;
  v_id uuid;
  v_total int := 0;
begin
  if not es_oficina() then raise exception 'Solo la oficina puede facturar'; end if;
  for c in
    select distinct cl.id, cl.tipo_comprobante, cl.dias_credito, cl.exento_itbis, cl.rnc
    from visitas_por_facturar p join clientes cl on cl.id = p.cliente_id
    where p.fecha between p_desde and p_hasta
      and (p_clientes is null or cl.id = any (p_clientes))
  loop
    insert into facturas (tipo_doc, tipo_ncf, cliente_id, dias_credito, creado_por, notas)
    values ('factura',
            coalesce(c.tipo_comprobante, case when coalesce(trim(c.rnc), '') <> '' then 'B01' else 'B02' end),
            c.id, c.dias_credito, auth.uid(),
            'Servicios del ' || to_char(p_desde, 'DD/MM/YYYY') || ' al ' || to_char(p_hasta, 'DD/MM/YYYY'))
    returning id into v_id;
    insert into factura_lineas (factura_id, orden, descripcion, servicio_id, visita_id, cantidad, precio, itbis_tasa)
    select v_id, row_number() over (order by p.fecha, p.sucursal),
           coalesce(p.servicio, 'Servicio') || ' · ' || p.sucursal || ' · ' || to_char(p.fecha, 'DD/MM/YYYY'),
           p.servicio_id, p.id, 1, coalesce(p.precio, 0),
           case when c.exento_itbis then 0 else 18 end
    from visitas_por_facturar p
    where p.cliente_id = c.id and p.fecha between p_desde and p_hasta;
    v_total := v_total + 1;
  end loop;
  return v_total;
end $$;

-- Datos de la factura para el enlace del cliente (sin usuario)
create or replace function factura_publica(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'factura', to_jsonb(f) - 'creado_por' - 'token',
    'tipo_nombre', t.nombre,
    'referencia_ncf', r.ncf,
    'lineas', coalesce((select jsonb_agg(to_jsonb(l) - 'factura_id' order by l.orden) from factura_lineas l where l.factura_id = f.id), '[]'),
    'empresa', (select to_jsonb(e) - 'id' from empresa e where e.id = 1)
  )
  from facturas f
  left join tipos_comprobante t on t.codigo = f.tipo_ncf
  left join facturas r on r.id = f.referencia_id
  where f.token = p_token and f.estado <> 'borrador'
$$;

-- ---------------------------------------------------------------------
-- 6. Permisos
-- ---------------------------------------------------------------------
alter table facturas enable row level security;
alter table factura_lineas enable row level security;
drop policy if exists facturas_ofi on facturas;
create policy facturas_ofi on facturas for all to authenticated using (es_oficina()) with check (es_oficina());
drop policy if exists lineas_ofi on factura_lineas;
create policy lineas_ofi on factura_lineas for all to authenticated using (es_oficina()) with check (es_oficina());

-- Solo se borran borradores
drop policy if exists facturas_no_borrar on facturas;
create policy facturas_no_borrar on facturas as restrictive for delete to authenticated using (estado = 'borrador');

revoke execute on function tomar_ncf(text, date) from public, anon, authenticated;
revoke execute on function emitir_documento(uuid) from public, anon;
revoke execute on function anular_documento(uuid, text) from public, anon;
revoke execute on function crear_nota_credito(uuid) from public, anon;
revoke execute on function proforma_a_factura(uuid, text) from public, anon;
revoke execute on function facturar_periodo(date, date, uuid[]) from public, anon;
grant execute on function emitir_documento(uuid) to authenticated;
grant execute on function anular_documento(uuid, text) to authenticated;
grant execute on function crear_nota_credito(uuid) to authenticated;
grant execute on function proforma_a_factura(uuid, text) to authenticated;
grant execute on function facturar_periodo(date, date, uuid[]) to authenticated;
grant execute on function factura_publica(uuid) to anon, authenticated;
grant usage on sequence proformas_numero to authenticated;
