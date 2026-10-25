"""Etapa 3: equipos sin internet. Correr en una base recién creada, después de aislamiento.py y precios.py."""
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _comun import *   # noqa: F401,F403
import _comun as c

A = valor("ana", "select id from negocios where nombre = 'Tienda Precios'")
B = valor("beto", "select id from negocios where nombre = 'Otra Tienda'")
pri = valor("ana", f"select id from sucursales where negocio_id = '{A}' and es_principal")
norte = valor("ana", f"select id from sucursales where negocio_id = '{A}' and codigo = 'norte'")
centro = valor("ana", f"select id from sucursales where negocio_id = '{A}' and codigo = 'centro'")
priB = valor("beto", f"select id from sucursales where negocio_id = '{B}' and es_principal")
# carla: encargada de Centro en el negocio de ana
valor(False, f"insert into miembros (negocio_id, user_id, rol, sucursal_id) values ('{A}', '{U['carla']}', 'encargado', '{centro}') on conflict (negocio_id, user_id) do update set rol = 'encargado', sucursal_id = excluded.sucursal_id")

CL1 = "a" * 40 + "1" * 24
CL2 = "b" * 64
CL3 = "c" * 64

def js(v):
    try: return json.loads(v)
    except Exception: return v

# 1. El equipo (sin sesión) pide código
r = js(valor(None, f"select public.solicitar_vinculo('{CL1}')"))
ok(isinstance(r, dict) and len(r["codigo"]) == 8 and r["codigo"].isdigit(), f"equipo sin sesión recibe un código de 8 cifras ({r})")
cod1 = r["codigo"]
r2 = js(valor(None, f"select public.solicitar_vinculo('{CL1}')"))
ok(valor(False, "select count(*) from vinculos") == "1", "pedir otra vez reemplaza el código anterior (uno por equipo)")
cod1 = r2["codigo"]
ok(not puede(None, "select public.solicitar_vinculo('corta')"), "clave de equipo corta: rechazada")
ok("equipo_pendiente" in valor(None, f"select public.equipo_estado('{CL1}')"), "antes de vincular: «pendiente»")
ok("equipo_no_valido" in valor(None, f"select public.equipo_estado('{CL3}')"), "clave desconocida: «no válido»")
ok(not puede(None, "select * from vinculos") and not puede("ana", "select * from vinculos"), "nadie lee los códigos pendientes")
ok(valor(False, "select count(*) from vinculos where huella::text like '%aaaa%'") == "0", "en la base solo queda la huella, no la clave")

# 2. Vincular desde el panel
ok(not puede("beto", f"select public.vincular_equipo('{cod1}', '{pri}', 'X')"), "otro negocio no vincula a tu sucursal")
ok(not puede("dani", f"select public.vincular_equipo('{cod1}', '{pri}', 'X')"), "un verificador no vincula equipos")
ok(valor("ana", f"select coalesce(public.vincular_equipo('00000000', '{pri}', 'X')::text, 'no')") == "no", "código equivocado: no vincula")
e1 = valor("ana", f"select public.vincular_equipo('{cod1[:4]}-{cod1[4:]}', '{pri}', 'Caja 1')")
ok(len(e1) == 36, "el dueño vincula con el código (acepta 1234-5678)")
ok(valor("ana", f"select coalesce(public.vincular_equipo('{cod1}', '{pri}', 'Otra vez')::text, 'no')") == "no", "el código se usa una sola vez")
ok(not puede(None, f"select public.solicitar_vinculo('{CL1}')"), "un equipo ya vinculado no pide código otra vez")

# encargada: solo su sucursal
cod2 = js(valor(None, f"select public.solicitar_vinculo('{CL2}')"))["codigo"]
ok(not puede("carla", f"select public.vincular_equipo('{cod2}', '{norte}', 'X')"), "encargada no vincula a otra sucursal")
e2 = valor("carla", f"select public.vincular_equipo('{cod2}', '{centro}', '')")
ok(len(e2) == 36, "encargada vincula a su sucursal (nombre automático)")
ok(valor("ana", f"select nombre from equipos where id = '{e2}'").startswith("Equipo "), "sin nombre: «Equipo N»")

# 3. Lo que ve cada uno en el panel
ok(valor("ana", f"select count(*) from equipos where negocio_id = '{A}'") == "2", "el dueño ve los 2 equipos")
ok(valor("carla", "select count(*) from equipos") == "1", "la encargada ve solo el de su sucursal")
ok(valor("beto", "select count(*) from equipos") == "0", "otro negocio no ve tus equipos")
ok(valor("dani", "select count(*) from equipos") == "0", "un verificador no ve equipos")
ok(not puede("ana", f"update equipos set nombre = 'x' where id = '{e1}'"), "no se cambian equipos directo en la tabla")
ok(not puede("ana", f"insert into equipos (negocio_id, sucursal_id, nombre, huella) values ('{A}', '{pri}', 'x', '\\x00')"), "no se crean equipos directo en la tabla")

# 4. El equipo funciona con su clave
st = js(valor(None, f"select public.equipo_estado('{CL1}', 'web 1.0', 0, 3, null)"))
ok(st["negocio"]["nombre"] == "Tienda Precios" and st["sucursal"]["id"] == pri and st["equipo"]["nombre"] == "Caja 1",
   "estado: negocio, sucursal y nombre del equipo")
ok("apariencia" in st["negocio"] and bool(st["negocio"]["moneda"]), "estado: apariencia y moneda para la pantalla")
v1 = st["version"]
ok(valor("ana", f"select public.version_precios_panel('{pri}')") == v1, "el panel compara la versión del equipo con la actual")
ok(valor("beto", f"select coalesce(public.version_precios_panel('{pri}'), 'nada')") == "nada", "otro negocio no ve tu versión")
ok(not puede(None, f"select public.vincular_equipo('1', '{pri}', 'x')"), "sin sesión no se vincula")
ok("@" in v1, f"versión de precios del inventario de la Principal ({v1})")
ok(valor("ana", f"select app || ' ' || pendientes from equipos where id = '{e1}'") == "web 1.0 3", "el panel ve app y consultas pendientes")
ok(valor("ana", f"select visto is not null from equipos where id = '{e1}'") == "t", "el panel ve cuándo se conectó")
cat = js(valor(None, f"select public.equipo_catalogo('{CL1}')"))
ok(cat["version"] == v1 and len(cat["productos"]) == 2, f"catálogo: los 2 productos de la Principal")
ok(["7501055363063", "Refresco 2L", 125.5] in cat["productos"], "catálogo: código, nombre y precio")
valor("ana", f"update sucursales set fuente = '{{}}' where id = '{centro}'")
cat2 = js(valor(None, f"select public.equipo_catalogo('{CL2}')"))
ok(len(cat2["productos"]) == 2, "Centro (igual que la Principal) recibe los mismos precios")
ok("Secreto" not in json.dumps(cat) + json.dumps(cat2), "nunca recibe precios de otro negocio")

# cambia el inventario → cambia la versión
inv1 = valor("ana", f"select id from inventarios where negocio_id = '{A}' and nombre = 'General'")
valor("ana", f"""select public.reemplazar_productos('{inv1}', '[{{"codigo":"111","nombre":"Pan","precio":50}}]')""")
v2 = js(valor(None, f"select public.equipo_estado('{CL1}')"))["version"]
ok(v2 != v1, "al actualizar el inventario cambia la versión (el equipo descarga de nuevo)")
ok(len(js(valor(None, f"select public.equipo_catalogo('{CL1}')"))["productos"]) == 1, "y descarga los precios nuevos")

# 5. Subir consultas hechas sin internet
cons = json.dumps([{"codigo": "111", "encontrado": True, "nombre": "Pan", "precio": 50, "hora": "2020-01-01T00:00:00Z"},
                   {"codigo": "999", "encontrado": False, "hora": "2999-01-01T00:00:00Z"},
                   {"codigo": "  ", "encontrado": False}])
ok(valor(None, f"select public.equipo_anotar('{CL1}', '{cons}')") == "2", "sube las consultas (ignora las vacías)")
ok(valor("ana", f"select count(*) from consultas where equipo_id = '{e1}' and canal = 'equipo' and sucursal_id = '{pri}'") == "2",
   "quedan en el registro del negocio, con su equipo y sucursal")
ok(valor("ana", f"select bool_and(creado <= now() and creado >= now() - interval '31 days') from consultas where equipo_id = '{e1}'") == "t",
   "una hora futura o muy vieja del equipo se corrige")
mucho = json.dumps([{"codigo": "1", "encontrado": False}] * 501)
ok(not puede(None, f"select public.equipo_anotar('{CL1}', '{mucho}')"), "más de 500 por vez: rechazado")
ok(not puede(None, f"select public.equipo_anotar('{CL3}', '[]')"), "sin clave válida no se sube nada")
ok(not puede(None, f"select * from consultas"), "el equipo no puede leer el registro")

# 6. Mover y quitar
ok(not puede("carla", f"select public.cambiar_equipo('{e2}', null, '{norte}')"), "encargada no mueve su equipo a otra sucursal")
ok(not puede("ana", f"select public.cambiar_equipo('{e1}', null, '{priB}')"), "no se mueve un equipo a otro negocio")
valor("ana", f"select public.cambiar_equipo('{e1}', 'Caja norte', '{norte}')")
st = js(valor(None, f"select public.equipo_estado('{CL1}')"))
ok(st["sucursal"]["id"] == norte and st["equipo"]["nombre"] == "Caja norte", "el dueño lo renombra y lo mueve a Norte")
ok(len(js(valor(None, f"select public.equipo_catalogo('{CL1}')"))["productos"]) == 1 and st["version"] != v2,
   "en Norte recibe los precios de Norte")
ok(not puede("beto", f"select public.quitar_equipo('{e1}')"), "otro negocio no quita tus equipos")
valor("ana", f"select public.quitar_equipo('{e1}')")
ok("equipo_no_valido" in valor(None, f"select public.equipo_estado('{CL1}')"), "equipo quitado: deja de recibir precios")
ok(valor("ana", f"select count(*) from consultas where codigo = '111' and equipo_id is null and canal = 'equipo'") == "1",
   "sus consultas pasadas se conservan")
r = js(valor(None, f"select public.solicitar_vinculo('{CL1}')"))
ok(isinstance(r, dict), "el equipo quitado puede pedir un código nuevo")

# 7. Vincular desde el propio equipo con usuario autorizado (0005)
CL5 = "e" * 64
valor(None, f"select public.solicitar_vinculo('{CL5}')")
ok(not puede(None, f"select public.vincular_en_equipo('{CL5}', '{pri}', 'X')"), "en el equipo: sin entrar con usuario no se vincula")
ok(not puede("dani", f"select public.vincular_en_equipo('{CL5}', '{pri}', 'X')"), "en el equipo: un verificador no autoriza")
ok(not puede("beto", f"select public.vincular_en_equipo('{CL5}', '{pri}', 'X')"), "en el equipo: usuario de otro negocio no autoriza")
ok(not puede("carla", f"select public.vincular_en_equipo('{CL5}', '{norte}', 'X')"), "en el equipo: la encargada no lo pone en otra sucursal")
r = js(valor("carla", f"select public.vincular_en_equipo('{CL5}', '{centro}', 'Entrada')"))
ok(isinstance(r, dict) and len(r["equipo"]) == 36, "en el equipo: la encargada lo pone en su sucursal")
ok(valor(False, f"select count(*) from vinculos where huella = public.huella_de('{CL5}')") == "0", "su código de 8 cifras se borra")
st = js(valor(None, f"select public.equipo_estado('{CL5}')"))
ok(st["sucursal"]["id"] == centro and st["equipo"]["nombre"] == "Entrada", "el equipo arranca en la sucursal elegida")
ok(not puede("ana", f"select public.vincular_en_equipo('{CL5}', '{pri}', 'Otra')"), "un equipo ya vinculado no se vincula dos veces")
ok(not puede("ana", f"select public.vincular_en_equipo('corta', '{pri}', 'X')"), "clave de equipo inválida: rechazada")

print(f"\n{c.bien} bien, {c.mal} mal")
