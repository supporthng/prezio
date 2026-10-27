-- Se corre después de 03_pruebas.sql
\set ON_ERROR_STOP 1
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
\set farmacia '\'30000000-0000-0000-0000-000000000001\''

\echo '--- Inventario: entrada de 10 Demand CS'
insert into productos (id, nombre, unidad, precio_venta, se_vende, minimo)
values ('90000000-0000-0000-0000-000000000001', 'Demand CS 250 ml', 'unidad', 1200, true, 3)
on conflict (id) do nothing;
insert into movimientos_inventario (producto_id, tipo, cantidad, motivo) values ('90000000-0000-0000-0000-000000000001', 'entrada', 10, 'Compra');
select existencia from productos where id = '90000000-0000-0000-0000-000000000001';
insert into secuencias (tipo, desde, hasta, siguiente) values ('B01', 1000, 1100, 1000), ('B02', 2000, 2100, 2000);

\echo '--- Venta rápida a consumidor final: 2 productos + servicio, paga 5,000 en efectivo'
select (v->>'ncf') as ncf, (v->>'total') as total, (v->>'cambio') as cambio
from venta_rapida('{"tipo_ncf":"B02","lineas":[
  {"descripcion":"Demand CS 250 ml","producto_id":"90000000-0000-0000-0000-000000000001","cantidad":2,"precio":1200,"itbis_tasa":18},
  {"descripcion":"Fumigación apartamento","cantidad":1,"precio":1500,"itbis_tasa":18}],
  "pagos":[{"forma":"efectivo","monto":5000}]}') v \gset vr_
select :'vr_ncf' as ncf, :'vr_total' as total, :'vr_cambio' as cambio;
select existencia as quedan from productos where id = '90000000-0000-0000-0000-000000000001';
select estado_pago, saldo from facturas_cobro where ncf = :'vr_ncf';
select nombre, generico from clientes where generico;

\set ON_ERROR_STOP 0
\echo 'Pago insuficiente (debe fallar):'
select venta_rapida('{"lineas":[{"descripcion":"X","cantidad":1,"precio":1000}],"pagos":[{"forma":"efectivo","monto":500}]}');
\echo 'Tarjeta por más del total (debe fallar):'
select venta_rapida('{"lineas":[{"descripcion":"X","cantidad":1,"precio":1000}],"pagos":[{"forma":"tarjeta","monto":2000}]}');
\echo 'Crédito a consumidor final (debe fallar):'
select venta_rapida('{"a_credito":true,"lineas":[{"descripcion":"X","cantidad":1,"precio":1000}]}');
\set ON_ERROR_STOP 1
select count(*) as secuencia_no_se_gasto_en_fallos from facturas where ncf like 'B02%' and venta_rapida;

\echo '--- Venta a crédito a la farmacia (30 días) y cobro parcial'
select (v->>'factura_id') as fid, (v->>'total') as total from venta_rapida(jsonb_build_object(
  'cliente_id', :farmacia, 'a_credito', true,
  'lineas', '[{"descripcion":"Control de roedores","cantidad":1,"precio":10000,"itbis_tasa":18}]'::jsonb)) v \gset cr_
select ncf, vence - fecha as dias, estado_pago, saldo from facturas_cobro where id = :'cr_fid';
select registrar_cobro(jsonb_build_object(
  'cliente_id', :farmacia,
  'pagos', '[{"forma":"transferencia","monto":5000,"referencia":"BHD 4455"}]'::jsonb,
  'aplicaciones', jsonb_build_array(jsonb_build_object('factura_id', :'cr_fid', 'monto', 5000)))) as c1 \gset
select numero from cobros where id = :'c1';
select estado_pago, cobrado, saldo from facturas_cobro where id = :'cr_fid';

\set ON_ERROR_STOP 0
\echo 'Aplicar más de lo que se debe (debe fallar):'
select registrar_cobro(jsonb_build_object('cliente_id', :farmacia,
  'pagos', '[{"forma":"efectivo","monto":9000}]'::jsonb,
  'aplicaciones', jsonb_build_array(jsonb_build_object('factura_id', :'cr_fid', 'monto', 9000))));
\echo 'Anular factura con cobros (debe fallar):'
select anular_documento(:'cr_fid', '04 Corrección');
\set ON_ERROR_STOP 1

\echo '--- Paga 10,000: 6,800 saldan la factura y 3,200 quedan a favor'
select registrar_cobro(jsonb_build_object('cliente_id', :farmacia,
  'pagos', '[{"forma":"cheque","monto":10000,"referencia":"Popular 00123"}]'::jsonb,
  'aplicaciones', jsonb_build_array(jsonb_build_object('factura_id', :'cr_fid', 'monto', 6800)))) as cobro2 \gset
select estado_pago, saldo from facturas_cobro where id = :'cr_fid';
select saldo_favor(:farmacia) as saldo_favor;

\echo '--- Límite de crédito estricto'
update empresa set bloquear_credito = true;
update clientes set limite_credito = 5000 where id = :farmacia;
\set ON_ERROR_STOP 0
\echo 'Venta a crédito que pasa el límite (debe fallar):'
select venta_rapida(jsonb_build_object('cliente_id', :farmacia, 'a_credito', true,
  'lineas', '[{"descripcion":"Termitas","cantidad":1,"precio":8000}]'::jsonb));
\set ON_ERROR_STOP 1
\echo 'De contado sí se puede, pagando con el saldo a favor + efectivo:'
select (v->>'ncf') as ncf, (v->>'cambio') as cambio from venta_rapida(jsonb_build_object('cliente_id', :farmacia,
  'lineas', '[{"descripcion":"Termitas","cantidad":1,"precio":2000,"itbis_tasa":18}]'::jsonb,
  'pagos', '[{"forma":"saldo_favor","monto":2360}]'::jsonb)) v;
select saldo_favor(:farmacia) as saldo_favor_queda;
update empresa set bloquear_credito = false;

\echo '--- Nota de crédito de la venta de mostrador (pagada): devuelve 1 producto, se reembolsa en efectivo'
select id as vfid from facturas where ncf = :'vr_ncf' \gset
select crear_nota_credito(:'vfid') as nc \gset
delete from factura_lineas where factura_id = :'nc' and producto_id is null;
update factura_lineas set cantidad = 1 where factura_id = :'nc';
update facturas set reembolso = 'efectivo', devuelve_inventario = true where id = :'nc';
select ncf, total, nc_aplicada, reembolso, reembolso_monto from emitir_documento(:'nc');
select existencia as quedan_tras_devolucion from productos where id = '90000000-0000-0000-0000-000000000001';

\echo '--- Nota de crédito a factura con saldo: rebaja lo que debe'
select (v->>'factura_id') as fid2 from venta_rapida(jsonb_build_object('cliente_id', :farmacia, 'a_credito', true,
  'lineas', '[{"descripcion":"Fumigación","cantidad":2,"precio":1000,"itbis_tasa":18}]'::jsonb)) v \gset
select crear_nota_credito(:'fid2') as nc2 \gset
update factura_lineas set cantidad = 1 where factura_id = :'nc2';
select total, nc_aplicada, reembolso_monto from emitir_documento(:'nc2');
select estado_pago, acreditado, saldo from facturas_cobro where id = :'fid2';
\set ON_ERROR_STOP 0
\echo 'Otra NC que pasa el total de la factura (debe fallar):'
select crear_nota_credito(:'fid2') as nc3 \gset
update factura_lineas set cantidad = 5 where factura_id = :'nc3';
select emitir_documento(:'nc3');
\set ON_ERROR_STOP 1

\echo '--- Anular el cobro del anticipo cuando ya se usó (debe fallar) y cuenta del cliente'
\set ON_ERROR_STOP 0
select anular_cobro(:'cobro2', 'Cheque devuelto');
\set ON_ERROR_STOP 1
select nombre, pendiente, por_vencer, saldo_favor, facturas_pendientes from clientes_cuenta where id = :farmacia;

\echo '--- Enlace público incluye pagos y saldo'
select (j->>'saldo') as saldo, jsonb_array_length(j->'pagos') as pagos, j->'pagos'->0->>'forma' as forma
from factura_publica((select token from facturas where id = :'cr_fid')) j;

\echo '--- Factura en dólares (tasa 60) y cobro en dólares'
insert into facturas (id, tipo_doc, tipo_ncf, cliente_id, dias_credito, moneda, tasa_cambio)
values ('70000000-0000-0000-0000-0000000000d1', 'factura', 'B01', :farmacia, 30, 'USD', 60);
insert into factura_lineas (factura_id, descripcion, cantidad, precio) values ('70000000-0000-0000-0000-0000000000d1', 'Fumigación de nave (USD)', 1, 500);
select ncf, moneda, tasa_cambio, total from emitir_documento('70000000-0000-0000-0000-0000000000d1');
select saldo, saldo_dop from facturas_cobro where id = '70000000-0000-0000-0000-0000000000d1';
\set ON_ERROR_STOP 0
\echo 'Cobrar la factura en dólares con un cobro en pesos (debe fallar):'
select registrar_cobro(jsonb_build_object('cliente_id', :farmacia, 'pagos', '[{"forma":"efectivo","monto":100}]'::jsonb,
  'aplicaciones', '[{"factura_id":"70000000-0000-0000-0000-0000000000d1","monto":100}]'::jsonb));
\echo 'Cambiar la tasa de una factura emitida (debe fallar):'
update facturas set tasa_cambio = 61 where id = '70000000-0000-0000-0000-0000000000d1';
\set ON_ERROR_STOP 1
select registrar_cobro(jsonb_build_object('cliente_id', :farmacia, 'moneda', 'USD', 'tasa_cambio', 60.5,
  'pagos', '[{"forma":"transferencia","monto":200}]'::jsonb,
  'aplicaciones', '[{"factura_id":"70000000-0000-0000-0000-0000000000d1","monto":200}]'::jsonb)) as cusd \gset
select numero, moneda, tasa_cambio, total from cobros where id = :'cusd';
select estado_pago, saldo, saldo_dop from facturas_cobro where id = '70000000-0000-0000-0000-0000000000d1';
select pendiente from clientes_cuenta where id = :farmacia;

\echo '--- El técnico no ve cobros'
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select count(*) as cobros_que_ve_juan from cobros;
\set ON_ERROR_STOP 0
select registrar_cobro('{}');
\set ON_ERROR_STOP 1
\echo 'FIN PRUEBAS COBROS'
