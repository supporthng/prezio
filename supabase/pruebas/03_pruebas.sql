\set ON_ERROR_STOP 1
-- Se corre después de 01_pruebas.sql y 02_pruebas.sql
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
\echo '--- Secuencias'
insert into secuencias (tipo, desde, hasta, siguiente, vence) values
  ('B01', 801, 803, 801, '2026-12-31'),
  ('B02', 1, 1000, 1, '2026-12-31'),
  ('B04', 1, 100, 1, '2026-12-31'),
  ('E31', 1, 1000, 1, null);
select tipo, primero, ultimo, disponibles, estado from secuencias_estado order by tipo;

update clientes set rnc = '1-01-12345-6', razon_social = 'Farmacias Salud Total SRL', tipo_comprobante = 'B01', dias_credito = 30
where id = '30000000-0000-0000-0000-000000000001';
insert into clientes (id, nombre) values ('30000000-0000-0000-0000-000000000010', 'Apartamento Sra. Gómez');

\echo '--- Por facturar (realizadas sin factura):'
select cliente, sucursal, servicio, fecha, precio from visitas_por_facturar order by fecha;
-- dar precio a las visitas realizadas para las pruebas
update visitas set precio = 2500 where estado = 'realizada' and precio is null;
select facturar_periodo('2026-01-01', '2026-12-31') as borradores_creados;
select count(*) as ya_no_aparecen_por_facturar from visitas_por_facturar;
select facturar_periodo('2026-01-01', '2026-12-31') as segunda_vez_no_duplica;

\echo '--- Borrador: totales calculados'
select tipo_ncf, subtotal, itbis, total, estado from facturas where cliente_id = '30000000-0000-0000-0000-000000000001';
\set f '(select id from facturas where cliente_id = ''30000000-0000-0000-0000-000000000001'' and tipo_doc = ''factura'' limit 1)'
insert into factura_lineas (factura_id, descripcion, cantidad, precio, descuento) values (:f, 'Desinfección extra', 2, 1000, 100);
select subtotal, descuento, itbis, total from facturas where id = :f;

\echo '--- Emitir: toma el NCF B0100000801'
select ncf, ncf_vence, vence, rnc, razon_social, estado, estado_ecf from emitir_documento(:f);
select count(*) as visitas_marcadas from visitas where factura_id = :f;
select ncf from emitir_documento(:f) as emitir_otra_vez_no_cambia;
\set ON_ERROR_STOP 0
\echo 'Editar una línea de una factura emitida (debe fallar):'
update factura_lineas set precio = 1 where factura_id = :f;
\echo 'Cambiar el total de una factura emitida (debe fallar):'
update facturas set total = 1 where id = :f;
\echo 'Borrar una factura emitida (0 filas):'
delete from facturas where id = :f;
\echo 'B01 a un cliente sin RNC (debe fallar):'
insert into facturas (id, tipo_ncf, cliente_id) values ('70000000-0000-0000-0000-000000000001', 'B01', '30000000-0000-0000-0000-000000000010');
insert into factura_lineas (factura_id, descripcion, precio) values ('70000000-0000-0000-0000-000000000001', 'Fumigación', 2000);
select emitir_documento('70000000-0000-0000-0000-000000000001');
\set ON_ERROR_STOP 1
update facturas set tipo_ncf = 'B02' where id = '70000000-0000-0000-0000-000000000001';
select ncf, total from emitir_documento('70000000-0000-0000-0000-000000000001');

\echo '--- Agotar la secuencia B01 (801-803)'
insert into facturas (id, tipo_ncf, cliente_id) values ('70000000-0000-0000-0000-000000000002', 'B01', '30000000-0000-0000-0000-000000000001'), ('70000000-0000-0000-0000-000000000003', 'B01', '30000000-0000-0000-0000-000000000001'), ('70000000-0000-0000-0000-000000000004', 'B01', '30000000-0000-0000-0000-000000000001');
insert into factura_lineas (factura_id, descripcion, precio) select id, 'Servicio', 1000 from facturas where id::text like '70000000-0000-0000-0000-00000000000_' and estado = 'borrador';
select ncf from emitir_documento('70000000-0000-0000-0000-000000000002');
select ncf from emitir_documento('70000000-0000-0000-0000-000000000003');
\set ON_ERROR_STOP 0
\echo 'Sin números disponibles (debe fallar con mensaje claro):'
select emitir_documento('70000000-0000-0000-0000-000000000004');
\set ON_ERROR_STOP 1
select tipo, disponibles, estado from secuencias_estado where tipo = 'B01';

\echo '--- e-CF: E31 queda pendiente de envío'
update facturas set tipo_ncf = 'E31' where id = '70000000-0000-0000-0000-000000000004';
select ncf, length(ncf) as largo, estado_ecf from emitir_documento('70000000-0000-0000-0000-000000000004');

\echo '--- Nota de crédito'
select crear_nota_credito(:f) as nc \gset
select tipo_doc, tipo_ncf, total from facturas where id = :'nc';
update factura_lineas set cantidad = 1, precio = 500, descuento = 0 where factura_id = :'nc' and descripcion = 'Desinfección extra';
delete from factura_lineas where factura_id = :'nc' and descripcion <> 'Desinfección extra';
select ncf, total, referencia_id is not null as modifica from emitir_documento(:'nc');
\set ON_ERROR_STOP 0
\echo 'Anular factura con nota de crédito (debe fallar):'
select anular_documento(:f, 'error');
\echo 'Anular e-CF pendiente de envío (se permite) y anular sin motivo (debe fallar):'
select anular_documento('70000000-0000-0000-0000-000000000004', '');
\set ON_ERROR_STOP 1
select estado from anular_documento('70000000-0000-0000-0000-000000000004', 'Cliente equivocado');

\echo '--- Anular libera las visitas para volver a facturar'
select estado from anular_documento('70000000-0000-0000-0000-000000000001', 'Precio incorrecto');

\echo '--- Proforma y conversión'
insert into facturas (id, tipo_doc, cliente_id) values ('70000000-0000-0000-0000-000000000005', 'proforma', '30000000-0000-0000-0000-000000000001');
insert into factura_lineas (factura_id, descripcion, cantidad, precio) values ('70000000-0000-0000-0000-000000000005', 'Termitas: inyección', 1, 38000);
select numero_proforma, ncf, total from emitir_documento('70000000-0000-0000-0000-000000000005');
select proforma_a_factura('70000000-0000-0000-0000-000000000005', 'B01') = proforma_a_factura('70000000-0000-0000-0000-000000000005', 'B01') as convertir_dos_veces_da_la_misma;

\echo '--- Técnico no ve facturas; anónimo ve solo por enlace'
select token as tok from facturas where ncf = 'B0100000801' \gset
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select count(*) as facturas_que_ve_juan from facturas;
reset request.jwt.claim.sub;
set role anon;
select (j->'factura'->>'ncf') as ncf, jsonb_array_length(j->'lineas') as lineas, j->'empresa'->>'nombre' as empresa
from factura_publica(:'tok') j;
select factura_publica(gen_random_uuid()) is null as enlace_falso;
\echo 'FIN PRUEBAS FACTURACIÓN'
