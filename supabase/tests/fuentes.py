"""Etapa 3.2: inventarios de Google y del conector. Correr en una base recién creada, después de los otros."""
import json, sys, os, uuid
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _comun import *   # noqa: F401,F403
import _comun as c

A = valor("ana", "select id from negocios where nombre = 'Tienda Precios'")
B = valor("beto", "select id from negocios where nombre = 'Otra Tienda'")
pri = valor("ana", f"select id from sucursales where negocio_id = '{A}' and es_principal")
SECRETO = valor(False, "select valor from ajustes_privados where clave = 'tareas_secreto'")

def js(v):
    try: return json.loads(v)
    except Exception: return v
def prods(n, precio=10, pre="P"):
    return json.dumps([{"codigo": f"{pre}{i}", "nombre": f"Producto {i}", "precio": precio} for i in range(n)])

ok(len(SECRETO) == 64, "la base crea su clave interna de tareas")
ok(not puede("ana", "select * from ajustes_privados") and not puede(None, "select * from ajustes_privados"), "nadie lee la clave interna")
ok(not puede("ana", "select * from cargas"), "nadie lee las cargas a medias")
ok(not puede("ana", f"insert into inventarios (negocio_id, nombre, origen) values ('{A}', 'Raro', '{{\"tipo\":\"ftp\"}}')"),
   "origen desconocido: rechazado")

# ---------------------------------------------------------------- Google
g = valor("ana", f"""insert into inventarios (negocio_id, nombre, origen) values ('{A}', 'Hoja Google',
  '{{"tipo":"google","url":"https://docs.google.com/spreadsheets/d/abc/edit","cada_min":60}}') returning id""")
ok(len(g) == 36, "el dueño crea un inventario de Google")
ok(not puede(None, "select public.google_pendientes('x')"), "pendientes sin la clave interna: rechazado")
ok(not puede("ana", f"select public.google_pendientes('{'0' * 64}')"), "clave interna equivocada: rechazada")
pend = js(valor(None, f"select public.google_pendientes('{SECRETO}')"))
ok(any(p["id"] == g and p["origen"]["url"].startswith("https://docs.google.com") for p in pend), "la tarea ve la hoja que toca actualizar")
pend2 = js(valor(None, f"select public.google_pendientes('{SECRETO}')"))
ok(all(p["id"] != g for p in pend2), "y no la repite en la misma vuelta")

lote = str(uuid.uuid4())
ok(valor(None, f"select public.google_aplicar('{SECRETO}', '{g}', '{lote}', '{prods(3000)}', false)") == "0", "parte 1 de 2 recibida")
ok(valor("ana", f"select count(*) from productos where inventario_id = '{g}'") == "0", "a medias no cambia los precios")
ok(valor(None, f"select public.google_aplicar('{SECRETO}', '{g}', '{lote}', '{prods(2500, 12, 'Q')}', true)") == "5500", "última parte: 5500 productos")
ok(valor("ana", f"select count(*) from productos where inventario_id = '{g}'") == "5500", "el inventario queda con todo")
est = js(valor("ana", f"select estado from inventarios where id = '{g}'"))
ok(est.get("productos") == 5500 and est.get("error") is None and est.get("ultimo"), "estado: última carga y cantidad")
ok(valor(False, "select count(*) from cargas") == "0", "las partes temporales se borran")
ok(not puede(None, f"select public.google_aplicar('{SECRETO}', '{g}', '{lote}', '{prods(5001)}', false)"), "más de 5000 por parte: rechazado")
# repetidos dentro de una parte: gana el último
rep = json.dumps([{"codigo": "R1", "nombre": "Viejo", "precio": 1}, {"codigo": "R1", "nombre": "Nuevo", "precio": 2}])
l2 = str(uuid.uuid4())
valor(None, f"select public.google_aplicar('{SECRETO}', '{g}', '{l2}', '{rep}', true)")
ok(valor("ana", f"select nombre || precio from productos where inventario_id = '{g}'") == "Nuevo2.00", "código repetido: gana el último")
# vacía: no borra
ok("no devolvió productos" in valor(None, f"select public.google_aplicar('{SECRETO}', '{g}', '{uuid.uuid4()}', '[]', true)"),
   "si la hoja llega vacía no se borran los precios")
ok(valor("ana", f"select count(*) from productos where inventario_id = '{g}'") == "1", "…y quedan los anteriores")
valor(None, f"select public.google_aplicar('{SECRETO}', '{g}', null, null, false, 'La hoja no está compartida')")
est = js(valor("ana", f"select estado from inventarios where id = '{g}'"))
ok(est["error"] == "La hoja no está compartida" and est["productos"] == 1, "un error se anota sin tocar los precios")
manual = valor("ana", f"insert into inventarios (negocio_id, nombre) values ('{A}', 'Manual') returning id")
ok(not puede(None, f"select public.google_aplicar('{SECRETO}', '{manual}', '{uuid.uuid4()}', '{prods(1)}', true)"),
   "la tarea solo escribe en inventarios de Google")

# Actualizar ahora desde el panel
l3 = str(uuid.uuid4())
ok(valor("ana", f"select public.cargar_inventario('{g}', '{l3}', '{prods(4)}', true)") == "4", "«Actualizar ahora» del dueño")
ok(not puede("beto", f"select public.cargar_inventario('{g}', '{uuid.uuid4()}', '{prods(4)}', true)"), "otro negocio no carga tu inventario")
ok(not puede("dani", f"select public.cargar_inventario('{g}', '{uuid.uuid4()}', '{prods(4)}', true)"), "un verificador no carga inventarios")
ok(not puede(None, f"select public.cargar_inventario('{g}', '{uuid.uuid4()}', '{prods(4)}', true)"), "sin sesión no se carga")

# la versión que ven los equipos cambia con cada carga
valor("ana", f"update sucursales set fuente = jsonb_build_object('tipo','inventario','inventario_id','{g}') where id = '{pri}'")
v1 = valor("ana", f"select public.version_precios_panel('{pri}')")
valor(None, f"select public.google_aplicar('{SECRETO}', '{g}', '{uuid.uuid4()}', '{prods(2)}', true)")
ok(valor("ana", f"select public.version_precios_panel('{pri}')") != v1, "al cargar Google cambia la versión: los equipos descargan")
r = js(valor("ana", f"select public.consultar_precio('{pri}', array['P1'])"))
ok(r.get("encontrado") and r["nombre"] == "Producto 1", "el verificador ya consulta los precios de Google")

# ---------------------------------------------------------------- conectores
ok(not puede("dani", f"select public.crear_conector('{A}', 'X')"), "un verificador no crea conectores")
ok(not puede("beto", f"select public.crear_conector('{A}', 'X')"), "otro negocio no crea conectores en el tuyo")
clave = valor("ana", f"select public.crear_conector('{A}', 'PC de caja')")
ok(clave.startswith("pzc_") and len(clave) == 68, "el dueño crea un conector y ve su clave una sola vez")
cid = valor("ana", f"select id from conectores where negocio_id = '{A}'")
ok(not puede("ana", "select huella from conectores"), "la huella de la clave no se lee")
ok(valor("beto", "select count(*) from conectores") == "0", "otro negocio no ve tus conectores")
ok(valor("dani", "select count(*) from conectores") == "0", "un verificador no ve conectores")
ok(not puede("ana", f"update conectores set nombre = 'x' where id = '{cid}'"), "no se cambian conectores directo en la tabla")

ci = valor("ana", f"""insert into inventarios (negocio_id, nombre, origen) values ('{A}', 'Del sistema',
  jsonb_build_object('tipo','conector','conector_id','{cid}')) returning id""")
st = js(valor(None, f"select public.conector_estado('{clave}', '1.0.0', 'CAJA-PC', null)"))
ok(st["conector"]["nombre"] == "PC de caja" and [i["id"] for i in st["inventarios"]] == [ci], "el conector ve solo el inventario que le toca")
ok(valor("ana", f"select version || ' ' || equipo from conectores where id = '{cid}'") == "1.0.0 CAJA-PC", "el panel ve versión y equipo del conector")
ok("conector_no_valido" in valor(None, "select public.conector_estado('pzc_" + "0" * 64 + "')"), "clave falsa: rechazada")
l4 = str(uuid.uuid4())
ok(valor(None, f"select public.conector_subir('{clave}', '{ci}', '{l4}', '{prods(7)}', true)") == "7", "el conector llena su inventario")
ok(not puede(None, f"select public.conector_subir('{clave}', '{g}', '{uuid.uuid4()}', '{prods(1)}', true)"), "no escribe en otro inventario del negocio")
invB = valor("beto", f"insert into inventarios (negocio_id, nombre, origen) values ('{B}', 'Ajeno conector', jsonb_build_object('tipo','conector','conector_id','{cid}')) returning id")
ok(not puede(None, f"select public.conector_subir('{clave}', '{invB}', '{uuid.uuid4()}', '{prods(1)}', true)"),
   "aunque otro negocio ponga tu conector en su inventario, no puede escribir ahí")
valor(None, f"select public.conector_estado('{clave}', '1.0.0', 'CAJA-PC', 'Login failed for user')")
ok(valor("ana", f"select error from conectores where id = '{cid}'") == "Login failed for user", "el panel ve el error del conector")
ok(not puede("beto", f"select public.quitar_conector('{cid}')"), "otro negocio no quita tu conector")
valor("ana", f"select public.quitar_conector('{cid}')")
ok("conector_no_valido" in valor(None, f"select public.conector_estado('{clave}')"), "conector quitado: su clave deja de servir")
ok(valor("ana", f"select count(*) from productos where inventario_id = '{ci}'") == "7", "sus precios ya cargados se quedan")

# La tarea programada (con funciones de prueba en lugar de pg_cron / pg_net)
valor(False, """create schema if not exists net; create or replace function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds int)
  returns bigint language sql as $$ select length(url || (headers->>'x-prezio-tareas'))::bigint $$;""")
ok(valor(False, """select net.http_post(
            url := (select valor from public.ajustes_privados where clave = 'sitio') || '/api/tareas/google',
            headers := jsonb_build_object('Content-Type', 'application/json',
                                          'x-prezio-tareas', (select valor from public.ajustes_privados where clave = 'tareas_secreto')),
            body := '{}'::jsonb, timeout_milliseconds := 60000)""") == str(len("https://prezio-jade.vercel.app/api/tareas/google") + 64),
   "la llamada de la tarea programada arma dirección y clave")

print(f"\n{c.bien} bien, {c.mal} mal")
