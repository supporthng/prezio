-- =====================================================================
-- Fumio · 04 · Cobros, crédito, devoluciones, inventario y venta rápida
-- Ejecutar después de 03_facturacion.sql. Se puede ejecutar más de una vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Ajustes de la empresa y del cliente
-- ---------------------------------------------------------------------
alter table empresa add column if not exists bloquear_credito boolean not null default false;
alter table empresa add column if not exists mensaje_ticket text;

alter table clientes add column if not exists limite_credito numeric(14,2) check (limite_credito is null or limite_credito >= 0);
alter table clientes add column if not exists generico boolean not null default false;  -- «Consumidor final»
create unique index if not exists clientes_un_generico on clientes (generico) where generico;

-- ---------------------------------------------------------------------
-- 2. Inventario de productos de consumo
-- ---------------------------------------------------------------------
alter table productos add column if not exists precio_venta numeric(14,2) not null default 0 check (precio_venta >= 0);
alter table productos add column if not exists costo numeric(14,2) not null default 0 check (costo >= 0);
alter table productos add column if not exists existencia numeric(14,2) not null default 0;
alter table productos add column if not exists minimo numeric(14,2) not null default 0;
alter table productos add column if not exists se_vende boolean not null default false;
alter table productos add column if not exists itbis_tasa numeric(5,2) not null default 18 check (itbis_tasa in (0, 16, 18));

do $$ begin
  create type tipo_movimiento as enum ('entrada', 'venta', 'devolucion', 'anulacion', 'ajuste', 'uso');
exception when duplicate_object then null; end $$;

create table if not exists movimientos_inventario (
  id           uuid primary key default gen_random_uuid(),
  producto_id  uuid not null references productos (id) on delete cascade,
  fecha        timestamptz not null default now(),
  tipo         tipo_movimiento not null,
  cantidad     numeric(14,2) not null check (cantidad <> 0),  -- + entra, − sale
  motivo       text,
  factura_id   uuid references facturas (id) on delete set null,
  creado_por   uuid references perfiles (id) default auth.uid()
);
create index if not exists movimientos_producto_idx on movimientos_inventario (producto_id, fecha);

create or replace function al_mover_inventario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update productos set existencia = existencia + new.cantidad where id = new.producto_id;
  return null;
end $$;
create or replace trigger movimientos_existencia
  after insert on movimientos_inventario
  for each row execute function al_mover_inventario();

alter table movimientos_inventario enable row level security;
drop policy if exists movimientos_ofi on movimientos_inventario;
create policy movimientos_ofi on movimientos_inventario for select to authenticated using (es_oficina());
drop policy if exists movimientos_ofi_crear on movimientos_inventario;
create policy movimientos_ofi_crear on movimientos_inventario for insert to authenticated
  with check (es_oficina() and tipo in ('entrada', 'ajuste', 'uso'));

alter table factura_lineas add column if not exists producto_id uuid references productos (id) on delete set null;

-- ---------------------------------------------------------------------
-- 3. Devoluciones en notas de crédito
--    nc_aplicada: parte que rebaja lo que se debe de la factura
--    reembolso: qué se hace con el resto (saldo a favor o devolver dinero)
-- ---------------------------------------------------------------------
do $$ begin
  create type forma_pago as enum ('efectivo', 'transferencia', 'tarjeta', 'cheque', 'saldo_favor', 'otro');
exception when duplicate_object then null; end $$;

alter table facturas add column if not exists nc_aplicada numeric(14,2) not null default 0;
alter table facturas add column if not exists reembolso text not null default 'saldo'
  check (reembolso in ('saldo', 'efectivo', 'transferencia', 'cheque', 'tarjeta'));
alter table facturas add column if not exists reembolso_monto numeric(14,2) not null default 0;
alter table facturas add column if not exists devuelve_inventario boolean not null default true;
alter table facturas add column if not exists venta_rapida boolean not null default false;

-- Moneda: los montos de la factura están en su moneda; tasa = pesos por unidad
alter table facturas add column if not exists moneda text not null default 'DOP' check (moneda in ('DOP', 'USD', 'EUR'));
alter table facturas add column if not exists tasa_cambio numeric(12,4) not null default 1 check (tasa_cambio > 0);
alter table clientes add column if not exists moneda text not null default 'DOP' check (moneda in ('DOP', 'USD', 'EUR'));

-- ---------------------------------------------------------------------
-- 4. Cobros (recibos de ingreso) y saldo a favor
-- ---------------------------------------------------------------------
create sequence if not exists cobros_numero;

create table if not exists cobros (
  id                uuid primary key default gen_random_uuid(),
  numero            text unique not null default 'REC-' || lpad(nextval('cobros_numero')::text, 5, '0'),
  cliente_id        uuid not null references clientes (id),
  fecha             date not null default current_date,
  total             numeric(14,2) not null check (total >= 0),   -- lo que realmente entró
  cambio            numeric(14,2) not null default 0 check (cambio >= 0),
  moneda            text not null default 'DOP' check (moneda in ('DOP', 'USD', 'EUR')),
  tasa_cambio       numeric(12,4) not null default 1 check (tasa_cambio > 0),
  notas             text,
  estado            text not null default 'activo' check (estado in ('activo', 'anulado')),
  motivo_anulacion  text,
  creado_por        uuid references perfiles (id) default auth.uid(),
  creado_en         timestamptz not null default now(),
  anulado_en        timestamptz
);
create index if not exists cobros_cliente_idx on cobros (cliente_id, fecha);
alter table cobros add column if not exists moneda text not null default 'DOP' check (moneda in ('DOP', 'USD', 'EUR'));
alter table cobros add column if not exists tasa_cambio numeric(12,4) not null default 1 check (tasa_cambio > 0);

create table if not exists cobro_pagos (
  id          uuid primary key default gen_random_uuid(),
  cobro_id    uuid not null references cobros (id) on delete cascade,
  forma       forma_pago not null,
  monto       numeric(14,2) not null check (monto > 0),
  referencia  text   -- número de transferencia, cheque o últimos 4 de la tarjeta
);
create index if not exists cobro_pagos_cobro_idx on cobro_pagos (cobro_id);

create table if not exists cobro_aplicaciones (
  id          uuid primary key default gen_random_uuid(),
  cobro_id    uuid not null references cobros (id) on delete cascade,
  factura_id  uuid not null references facturas (id),
  monto       numeric(14,2) not null check (monto > 0)
);
create index if not exists cobro_aplicaciones_cobro_idx on cobro_aplicaciones (cobro_id);
create index if not exists cobro_aplicaciones_factura_idx on cobro_aplicaciones (factura_id);

-- Libro del saldo a favor de cada cliente (+ entra, − se usa o se devuelve)
create table if not exists movimientos_saldo (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references clientes (id) on delete cascade,
  fecha       timestamptz not null default now(),
  monto       numeric(14,2) not null check (monto <> 0),
  concepto    text not null,
  cobro_id    uuid references cobros (id) on delete set null,
  factura_id  uuid references facturas (id) on delete set null
);
create index if not exists movimientos_saldo_cliente_idx on movimientos_saldo (cliente_id);

alter table cobros enable row level security;
alter table cobro_pagos enable row level security;
alter table cobro_aplicaciones enable row level security;
alter table movimientos_saldo enable row level security;
drop policy if exists cobros_ofi on cobros;
create policy cobros_ofi on cobros for select to authenticated using (es_oficina());
drop policy if exists cobro_pagos_ofi on cobro_pagos;
create policy cobro_pagos_ofi on cobro_pagos for select to authenticated using (es_oficina());
drop policy if exists cobro_aplicaciones_ofi on cobro_aplicaciones;
create policy cobro_aplicaciones_ofi on cobro_aplicaciones for select to authenticated using (es_oficina());
drop policy if exists movimientos_saldo_ofi on movimientos_saldo;
create policy movimientos_saldo_ofi on movimientos_saldo for select to authenticated using (es_oficina());
-- (los cobros solo se crean y anulan con las funciones de abajo)

-- ---------------------------------------------------------------------
-- 5. Saldos
-- ---------------------------------------------------------------------
create or replace function cobrado_factura(p_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(a.monto), 0) from cobro_aplicaciones a join cobros c on c.id = a.cobro_id
  where a.factura_id = p_id and c.estado = 'activo'
$$;

create or replace function acreditado_factura(p_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(nc_aplicada), 0) from facturas
  where referencia_id = p_id and tipo_doc = 'nota_credito' and estado = 'emitida'
$$;

create or replace function saldo_factura(p_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select case when f.tipo_doc = 'factura' and f.estado = 'emitida'
    then greatest(f.total - cobrado_factura(f.id) - acreditado_factura(f.id), 0) else 0 end
  from facturas f where f.id = p_id
$$;

create or replace function saldo_favor(p_cliente uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(monto), 0) from movimientos_saldo where cliente_id = p_cliente
$$;

-- Facturas emitidas con lo cobrado y lo pendiente (saldo en su moneda y en pesos)
drop view if exists clientes_cuenta;
drop view if exists facturas_cobro;
create view facturas_cobro with (security_invoker = true) as
select f.id, f.cliente_id, f.ncf, f.tipo_ncf, f.fecha, f.vence, f.dias_credito, f.total, f.token, f.moneda, f.tasa_cambio,
       coalesce(f.razon_social, f.cliente_nombre) as cliente, f.rnc, f.venta_rapida,
       x.cobrado, x.acreditado,
       greatest(f.total - x.cobrado - x.acreditado, 0) as saldo,
       round(greatest(f.total - x.cobrado - x.acreditado, 0) * f.tasa_cambio, 2) as saldo_dop,
       case
         when f.total - x.cobrado - x.acreditado <= 0 then 'pagada'
         when f.vence is not null and f.vence < current_date then 'vencida'
         when x.cobrado + x.acreditado > 0 then 'parcial'
         else 'pendiente'
       end as estado_pago,
       greatest(current_date - f.vence, 0) as dias_vencida
from facturas f
cross join lateral (
  select
    (select coalesce(sum(a.monto), 0) from cobro_aplicaciones a join cobros c on c.id = a.cobro_id
       where a.factura_id = f.id and c.estado = 'activo') as cobrado,
    (select coalesce(sum(n.nc_aplicada), 0) from facturas n
       where n.referencia_id = f.id and n.tipo_doc = 'nota_credito' and n.estado = 'emitida') as acreditado
) x
where f.tipo_doc = 'factura' and f.estado = 'emitida';

-- Resumen por cliente: lo que debe por antigüedad, saldo a favor y límite
create view clientes_cuenta with (security_invoker = true) as
select c.id, c.nombre, c.razon_social, c.rnc, c.telefono, c.dias_credito, c.limite_credito,
       coalesce(sum(fc.saldo_dop), 0) as pendiente,
       coalesce(sum(fc.saldo_dop) filter (where fc.vence is null or fc.vence >= current_date), 0) as por_vencer,
       coalesce(sum(fc.saldo_dop) filter (where fc.dias_vencida between 1 and 30), 0) as d1_30,
       coalesce(sum(fc.saldo_dop) filter (where fc.dias_vencida between 31 and 60), 0) as d31_60,
       coalesce(sum(fc.saldo_dop) filter (where fc.dias_vencida between 61 and 90), 0) as d61_90,
       coalesce(sum(fc.saldo_dop) filter (where fc.dias_vencida > 90), 0) as d90,
       count(fc.id) filter (where fc.saldo > 0) as facturas_pendientes,
       max(fc.dias_vencida) filter (where fc.saldo > 0) as max_dias_vencida,
       (select coalesce(sum(m.monto), 0) from movimientos_saldo m where m.cliente_id = c.id) as saldo_favor
from clientes c
left join facturas_cobro fc on fc.cliente_id = c.id
group by c.id;

-- ---------------------------------------------------------------------
-- 6. Emitir: ahora con inventario, devoluciones y límite de crédito
-- ---------------------------------------------------------------------
create or replace function emitir_documento(p_id uuid)
returns facturas language plpgsql security definer set search_path = public as $$
declare
  f facturas;
  c clientes;
  t tipos_comprobante;
  e empresa;
  v_lineas int;
  v_vence date;
  ref facturas;
  v_previas numeric;
  v_saldo_ref numeric;
  v_aplicada numeric;
  v_resto numeric;
  v_pendiente numeric;
begin
  if not es_oficina() then raise exception 'Solo la oficina puede emitir'; end if;
  select * into f from facturas where id = p_id for update;
  if not found then raise exception 'El documento no existe'; end if;
  if f.estado <> 'borrador' then return f; end if;  -- ya emitido: no hace nada
  select count(*) into v_lineas from factura_lineas where factura_id = p_id;
  if v_lineas = 0 then raise exception 'Agrega al menos una línea antes de emitir'; end if;
  select * into c from clientes where id = f.cliente_id;
  select * into e from empresa where id = 1;

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

  -- Límite de crédito (solo ventas a crédito)
  if f.tipo_doc = 'factura' and f.dias_credito > 0 and e.bloquear_credito then
    select coalesce(sum(saldo_dop), 0) into v_pendiente from facturas_cobro where cliente_id = c.id;
    if c.limite_credito is not null and v_pendiente + f.total * f.tasa_cambio > c.limite_credito then
      raise exception 'El cliente pasaría su límite de crédito (debe %, límite %). Cobra antes o factura de contado.',
        to_char(v_pendiente, 'FM999,999,990.00'), to_char(c.limite_credito, 'FM999,999,990.00');
    end if;
    if exists (select 1 from facturas_cobro where cliente_id = c.id and estado_pago = 'vencida') then
      raise exception 'El cliente tiene facturas vencidas. Cobra antes o factura de contado.';
    end if;
  end if;

  if f.tipo_doc = 'nota_credito' then
    select * into ref from facturas where id = f.referencia_id;
    if ref.estado <> 'emitida' or ref.tipo_doc <> 'factura' then
      raise exception 'La nota de crédito debe modificar una factura emitida';
    end if;
    if ref.moneda <> f.moneda then
      raise exception 'La nota de crédito debe estar en la misma moneda que la factura (%)', ref.moneda;
    end if;
    select coalesce(sum(total), 0) into v_previas from facturas
    where referencia_id = ref.id and tipo_doc = 'nota_credito' and estado = 'emitida';
    if f.total + v_previas > ref.total then
      raise exception 'Las notas de crédito no pueden sumar más que la factura (quedan % por acreditar)',
        to_char(ref.total - v_previas, 'FM999,999,990.00');
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

  if f.tipo_doc = 'factura' then
    -- Las visitas de las líneas quedan facturadas
    update visitas set factura_id = p_id
    where id in (select visita_id from factura_lineas where factura_id = p_id and visita_id is not null);
    -- Salen del inventario los productos vendidos
    insert into movimientos_inventario (producto_id, tipo, cantidad, motivo, factura_id)
    select l.producto_id, 'venta', -l.cantidad, 'Factura ' || f.ncf, p_id
    from factura_lineas l where l.factura_id = p_id and l.producto_id is not null;
  end if;

  if f.tipo_doc = 'nota_credito' then
    -- Primero rebaja lo que se debe de la factura; el resto se devuelve o queda a favor
    v_saldo_ref := saldo_factura(ref.id);
    v_aplicada := least(f.total, v_saldo_ref);
    v_resto := f.total - v_aplicada;
    update facturas set nc_aplicada = v_aplicada,
                        reembolso_monto = case when f.reembolso = 'saldo' then 0 else v_resto end
    where id = p_id returning * into f;
    if v_resto > 0 and f.reembolso = 'saldo' then
      insert into movimientos_saldo (cliente_id, monto, concepto, factura_id)
      values (f.cliente_id, round(v_resto * f.tasa_cambio, 2),
              'Nota de crédito ' || f.ncf || case when f.moneda <> 'DOP' then ' (' || f.moneda || ' a ' || f.tasa_cambio || ')' else '' end, p_id);
    end if;
    if f.devuelve_inventario then
      insert into movimientos_inventario (producto_id, tipo, cantidad, motivo, factura_id)
      select l.producto_id, 'devolucion', l.cantidad, 'Nota de crédito ' || f.ncf, p_id
      from factura_lineas l where l.factura_id = p_id and l.producto_id is not null;
    end if;
  end if;
  return f;
end $$;

-- Anular: no se anula lo que ya se cobró; regresa el inventario
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
  if cobrado_factura(p_id) > 0 then
    raise exception 'Esta factura tiene cobros. Anula primero el recibo o haz una nota de crédito.';
  end if;
  if f.tipo_doc = 'nota_credito' and f.reembolso = 'saldo'
     and exists (select 1 from movimientos_saldo where factura_id = p_id)
     and saldo_favor(f.cliente_id) < (select sum(monto) from movimientos_saldo where factura_id = p_id) then
    raise exception 'El saldo a favor de esta nota de crédito ya se usó en un cobro';
  end if;

  perform set_config('fumio.permitir', 'si', true);
  update facturas set estado = 'anulada', motivo_anulacion = p_motivo, anulada_en = now()
  where id = p_id returning * into f;
  update visitas set factura_id = null where factura_id = p_id;  -- se pueden volver a facturar

  -- Revierte inventario y saldo a favor
  insert into movimientos_inventario (producto_id, tipo, cantidad, motivo, factura_id)
  select m.producto_id, 'anulacion', -sum(m.cantidad), 'Anulación ' || coalesce(f.ncf, ''), p_id
  from movimientos_inventario m where m.factura_id = p_id
  group by m.producto_id having sum(m.cantidad) <> 0;
  insert into movimientos_saldo (cliente_id, monto, concepto, factura_id)
  select f.cliente_id, -sum(monto), 'Anulación ' || coalesce(f.ncf, ''), p_id
  from movimientos_saldo where factura_id = p_id having coalesce(sum(monto), 0) <> 0;
  return f;
end $$;

-- Nota de crédito y proforma copian también el producto
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
  insert into facturas (tipo_doc, tipo_ncf, cliente_id, referencia_id, fecha, notas, creado_por, reembolso, moneda, tasa_cambio)
  values ('nota_credito', case when left(f.tipo_ncf, 1) = 'E' then 'E34' else 'B04' end,
          f.cliente_id, f.id, current_date, 'Modifica ' || f.ncf, auth.uid(), 'saldo', f.moneda, f.tasa_cambio)
  returning id into v_id;
  insert into factura_lineas (factura_id, orden, descripcion, servicio_id, producto_id, cantidad, precio, descuento, itbis_tasa)
  select v_id, orden, descripcion, servicio_id, producto_id, cantidad, precio, descuento, itbis_tasa
  from factura_lineas where factura_id = p_factura;
  return v_id;
end $$;

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
  insert into facturas (tipo_doc, tipo_ncf, cliente_id, proforma_id, dias_credito, notas, creado_por, moneda, tasa_cambio)
  values ('factura', coalesce(p_tipo_ncf, c.tipo_comprobante, 'B02'), p.cliente_id, p.id, c.dias_credito, p.notas, auth.uid(), p.moneda, p.tasa_cambio)
  returning id into v_id;
  insert into factura_lineas (factura_id, orden, descripcion, servicio_id, producto_id, visita_id, cantidad, precio, descuento, itbis_tasa)
  select v_id, orden, descripcion, servicio_id, producto_id, visita_id, cantidad, precio, descuento, itbis_tasa
  from factura_lineas where factura_id = p_proforma;
  return v_id;
end $$;

-- Un documento emitido tampoco cambia de moneda ni de tasa
create or replace function proteger_emitida() returns trigger
language plpgsql as $$
begin
  if old.estado <> 'borrador' and current_setting('fumio.permitir', true) is distinct from 'si' then
    if (new.ncf, new.cliente_id, new.fecha, new.total, new.tipo_ncf, new.tipo_doc, new.moneda, new.tasa_cambio)
       is distinct from (old.ncf, old.cliente_id, old.fecha, old.total, old.tipo_ncf, old.tipo_doc, old.moneda, old.tasa_cambio) then
      raise exception 'Un documento emitido no se modifica. Anúlalo o haz una nota de crédito.';
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 7. Registrar y anular cobros
--    p = { cliente_id, fecha, notas, cambio,
--          pagos: [{forma, monto, referencia}],
--          aplicaciones: [{factura_id, monto}] }
--    Lo que sobra (pagos − cambio − aplicaciones) queda como saldo a favor.
-- ---------------------------------------------------------------------
create or replace function registrar_cobro(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid := (p->>'cliente_id')::uuid;
  v_id uuid;
  v_pagos numeric;
  v_efectivo numeric;
  v_favor numeric;
  v_cambio numeric := coalesce((p->>'cambio')::numeric, 0);
  v_total numeric;
  v_aplicado numeric := 0;
  a jsonb;
  fac record;
  v_monto numeric;
  v_numero text;
  v_moneda text := coalesce(nullif(p->>'moneda', ''), 'DOP');
  v_tasa numeric := coalesce(nullif(p->>'tasa_cambio', '')::numeric, 1);
begin
  if not es_oficina() then raise exception 'Solo la oficina puede registrar cobros'; end if;
  if v_moneda not in ('DOP', 'USD', 'EUR') then raise exception 'Moneda no válida'; end if;
  if v_moneda = 'DOP' then v_tasa := 1; end if;
  if v_tasa <= 0 then raise exception 'La tasa de cambio no es válida'; end if;
  if not exists (select 1 from clientes where id = v_cliente) then raise exception 'Elige el cliente'; end if;

  select coalesce(sum((x->>'monto')::numeric), 0),
         coalesce(sum((x->>'monto')::numeric) filter (where x->>'forma' = 'efectivo'), 0),
         coalesce(sum((x->>'monto')::numeric) filter (where x->>'forma' = 'saldo_favor'), 0)
  into v_pagos, v_efectivo, v_favor
  from jsonb_array_elements(coalesce(p->'pagos', '[]')) x;
  if v_pagos <= 0 then raise exception 'Indica cuánto pagó el cliente'; end if;
  if exists (select 1 from jsonb_array_elements(p->'pagos') x where coalesce((x->>'monto')::numeric, 0) <= 0) then
    raise exception 'Cada forma de pago debe tener un monto mayor que cero';
  end if;
  if v_cambio < 0 or v_cambio > v_efectivo then raise exception 'El cambio solo sale del efectivo'; end if;
  if v_favor > saldo_favor(v_cliente) then
    raise exception 'El cliente solo tiene % de saldo a favor', to_char(saldo_favor(v_cliente), 'FM999,999,990.00');
  end if;
  v_total := v_pagos - v_cambio;

  if v_moneda <> 'DOP' and v_favor > 0 then raise exception 'El saldo a favor está en pesos; úsalo en cobros en pesos'; end if;
  insert into cobros (cliente_id, fecha, total, cambio, notas, moneda, tasa_cambio)
  values (v_cliente, coalesce((p->>'fecha')::date, current_date), v_total, v_cambio, nullif(trim(p->>'notas'), ''), v_moneda, v_tasa)
  returning id, numero into v_id, v_numero;

  insert into cobro_pagos (cobro_id, forma, monto, referencia)
  select v_id, (x->>'forma')::forma_pago, (x->>'monto')::numeric, nullif(trim(x->>'referencia'), '')
  from jsonb_array_elements(p->'pagos') x;

  for a in select * from jsonb_array_elements(coalesce(p->'aplicaciones', '[]')) loop
    v_monto := round((a->>'monto')::numeric, 2);
    if v_monto is null or v_monto <= 0 then continue; end if;
    select id, cliente_id, ncf, moneda into fac from facturas
    where id = (a->>'factura_id')::uuid and tipo_doc = 'factura' and estado = 'emitida' for update;
    if not found or fac.cliente_id <> v_cliente then raise exception 'Una de las facturas no es de este cliente'; end if;
    if fac.moneda <> v_moneda then raise exception 'La factura % está en %; regístrala en un cobro aparte en esa moneda', fac.ncf, fac.moneda; end if;
    if v_monto > saldo_factura(fac.id) then
      raise exception 'A la factura % solo le quedan % por cobrar', fac.ncf, to_char(saldo_factura(fac.id), 'FM999,999,990.00');
    end if;
    insert into cobro_aplicaciones (cobro_id, factura_id, monto) values (v_id, fac.id, v_monto);
    v_aplicado := v_aplicado + v_monto;
  end loop;

  if v_aplicado > v_total then raise exception 'Se está aplicando más de lo que se cobró'; end if;

  -- Saldo a favor: se usa (−) y el sobrante queda (+)
  if v_favor > 0 then
    insert into movimientos_saldo (cliente_id, monto, concepto, cobro_id)
    values (v_cliente, -v_favor, 'Usado en ' || v_numero, v_id);
  end if;
  if v_total - v_aplicado > 0 then
    insert into movimientos_saldo (cliente_id, monto, concepto, cobro_id)
    values (v_cliente, round((v_total - v_aplicado) * v_tasa, 2),
            'Anticipo ' || v_numero || case when v_moneda <> 'DOP' then ' (' || v_moneda || ' a ' || v_tasa || ')' else '' end, v_id);
  end if;
  return v_id;
end $$;

create or replace function anular_cobro(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  k cobros;
  v_mov numeric;
begin
  if not es_oficina() then raise exception 'Solo la oficina puede anular cobros'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indica el motivo'; end if;
  select * into k from cobros where id = p_id for update;
  if not found then raise exception 'El recibo no existe'; end if;
  if k.estado = 'anulado' then return; end if;
  select coalesce(sum(monto), 0) into v_mov from movimientos_saldo where cobro_id = p_id;
  if v_mov > 0 and saldo_favor(k.cliente_id) < v_mov then
    raise exception 'El anticipo de este recibo ya se usó en otro cobro';
  end if;
  update cobros set estado = 'anulado', motivo_anulacion = p_motivo, anulado_en = now() where id = p_id;
  if v_mov <> 0 then
    insert into movimientos_saldo (cliente_id, monto, concepto, cobro_id)
    values (k.cliente_id, -v_mov, 'Anulación ' || k.numero, p_id);
  end if;
end $$;

-- Devolver en dinero un saldo a favor
create or replace function devolver_saldo(p_cliente uuid, p_monto numeric, p_forma text, p_nota text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_oficina() then raise exception 'Solo la oficina'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'Indica el monto'; end if;
  if p_monto > saldo_favor(p_cliente) then raise exception 'El cliente no tiene ese saldo a favor'; end if;
  insert into movimientos_saldo (cliente_id, monto, concepto)
  values (p_cliente, -p_monto, 'Devuelto en ' || coalesce(p_forma, 'efectivo') || coalesce(' · ' || nullif(trim(p_nota), ''), ''));
end $$;

-- ---------------------------------------------------------------------
-- 8. Venta rápida de mostrador: factura + cobro en un solo paso
--    p = { cliente_id (vacío = consumidor final), tipo_ncf, a_credito, notas,
--          lineas: [{descripcion, servicio_id, producto_id, cantidad, precio, descuento, itbis_tasa}],
--          pagos: [{forma, monto, referencia}] }
-- ---------------------------------------------------------------------
create or replace function cliente_generico() returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from clientes where generico;
  if v is null then
    insert into clientes (nombre, generico) values ('Consumidor final', true) returning id into v;
  end if;
  return v;
end $$;

create or replace function venta_rapida(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid := nullif(p->>'cliente_id', '')::uuid;
  c clientes;
  v_id uuid;
  f facturas;
  v_credito boolean := coalesce((p->>'a_credito')::boolean, false);
  v_pagos numeric;
  v_efectivo numeric;
  v_cambio numeric := 0;
  v_cobro uuid;
begin
  if not es_oficina() then raise exception 'Solo la oficina puede vender'; end if;
  if v_cliente is null then v_cliente := cliente_generico(); end if;
  select * into c from clientes where id = v_cliente;
  if not found then raise exception 'El cliente no existe'; end if;
  if v_credito and c.generico then raise exception 'Al consumidor final no se le vende a crédito. Elige el cliente.'; end if;
  if jsonb_array_length(coalesce(p->'lineas', '[]')) = 0 then raise exception 'Agrega al menos un servicio o producto'; end if;

  insert into facturas (tipo_doc, tipo_ncf, cliente_id, fecha, dias_credito, notas, creado_por, venta_rapida)
  values ('factura',
          coalesce(nullif(p->>'tipo_ncf', ''), c.tipo_comprobante, case when coalesce(trim(c.rnc), '') <> '' then 'B01' else 'B02' end),
          v_cliente, current_date, case when v_credito then greatest(c.dias_credito, 1) else 0 end,
          nullif(trim(p->>'notas'), ''), auth.uid(), true)
  returning id into v_id;

  insert into factura_lineas (factura_id, orden, descripcion, servicio_id, producto_id, cantidad, precio, descuento, itbis_tasa)
  select v_id, row_number() over (), x->>'descripcion', nullif(x->>'servicio_id', '')::uuid, nullif(x->>'producto_id', '')::uuid,
         (x->>'cantidad')::numeric, (x->>'precio')::numeric, coalesce((x->>'descuento')::numeric, 0),
         case when c.exento_itbis then 0 else coalesce((x->>'itbis_tasa')::numeric, 18) end
  from jsonb_array_elements(p->'lineas') x;

  f := emitir_documento(v_id);

  select coalesce(sum((x->>'monto')::numeric), 0),
         coalesce(sum((x->>'monto')::numeric) filter (where x->>'forma' = 'efectivo'), 0)
  into v_pagos, v_efectivo
  from jsonb_array_elements(coalesce(p->'pagos', '[]')) x;

  if not v_credito and v_pagos < f.total then
    raise exception 'Falta cobrar %', to_char(f.total - v_pagos, 'FM999,999,990.00');
  end if;
  if v_pagos > f.total then
    v_cambio := v_pagos - f.total;
    if v_cambio > v_efectivo then
      raise exception 'Con tarjeta, transferencia o cheque no se puede cobrar más del total';
    end if;
  end if;

  if v_pagos > 0 then
    v_cobro := registrar_cobro(jsonb_build_object(
      'cliente_id', v_cliente, 'cambio', v_cambio, 'pagos', p->'pagos',
      'aplicaciones', jsonb_build_array(jsonb_build_object('factura_id', v_id, 'monto', least(v_pagos - v_cambio, f.total)))));
  end if;

  return jsonb_build_object('factura_id', v_id, 'ncf', f.ncf, 'token', f.token, 'total', f.total,
                            'cambio', v_cambio, 'cobro_id', v_cobro);
end $$;

-- ---------------------------------------------------------------------
-- 9. Enlace del cliente: ahora con pagos y saldo
-- ---------------------------------------------------------------------
create or replace function factura_publica(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'factura', to_jsonb(f) - 'creado_por' - 'token',
    'tipo_nombre', t.nombre,
    'referencia_ncf', r.ncf,
    'lineas', coalesce((select jsonb_agg(to_jsonb(l) - 'factura_id' order by l.orden) from factura_lineas l where l.factura_id = f.id), '[]'),
    'empresa', (select to_jsonb(e) - 'id' - 'bloquear_credito' from empresa e where e.id = 1),
    'pagos', coalesce((
      select jsonb_agg(jsonb_build_object('forma', pg.forma, 'monto', pg.monto, 'numero', k.numero, 'fecha', k.fecha, 'cambio', k.cambio) order by k.creado_en)
      from cobro_aplicaciones a join cobros k on k.id = a.cobro_id and k.estado = 'activo'
      join cobro_pagos pg on pg.cobro_id = k.id
      where a.factura_id = f.id), '[]'),
    'saldo', saldo_factura(f.id)
  )
  from facturas f
  left join tipos_comprobante t on t.codigo = f.tipo_ncf
  left join facturas r on r.id = f.referencia_id
  where f.token = p_token and f.estado <> 'borrador'
$$;

-- ---------------------------------------------------------------------
-- 10. Permisos
-- ---------------------------------------------------------------------
revoke execute on function registrar_cobro(jsonb) from public, anon;
revoke execute on function anular_cobro(uuid, text) from public, anon;
revoke execute on function devolver_saldo(uuid, numeric, text, text) from public, anon;
revoke execute on function venta_rapida(jsonb) from public, anon;
revoke execute on function cliente_generico() from public, anon;
revoke execute on function emitir_documento(uuid) from public, anon;
revoke execute on function anular_documento(uuid, text) from public, anon;
revoke execute on function crear_nota_credito(uuid) from public, anon;
revoke execute on function proforma_a_factura(uuid, text) from public, anon;
grant execute on function factura_publica(uuid) to anon, authenticated;
