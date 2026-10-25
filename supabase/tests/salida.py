"""Etapa 3.3: clave para salir de las apps. Correr después de los demás (usa sus datos)."""
import hashlib, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _comun import *   # noqa: F401,F403
import _comun as c

A = valor("ana", "select id from negocios where nombre = 'Tienda Precios'")
B = valor("beto", "select id from negocios where nombre = 'Otra Tienda'")
sal = os.urandom(16).hex()
huella = hashlib.pbkdf2_hmac("sha256", b"4321", bytes.fromhex(sal), 150000).hex()
s = json.dumps({"sal": sal, "iter": 150000, "hash": huella})

ok(not puede("carla", f"select public.guardar_salida('{A}', '{s}')"), "una encargada no cambia la clave de salida")
ok(not puede("beto", f"select public.guardar_salida('{A}', '{s}')"), "otro negocio no cambia tu clave de salida")
ok(not puede("ana", f"""select public.guardar_salida('{A}', '{{"sal":"x","iter":1,"hash":"y"}}')"""), "clave mal formada o débil: rechazada")
ok(puede("ana", f"select public.guardar_salida('{A}', '{s}')"), "el dueño pone la clave de salida")
ok(not puede("ana", "select salida from negocio_salida"), "ni el dueño lee la huella desde el panel")
ok(valor("ana", f"select count(*) from negocio_salida where negocio_id = '{A}'") == "1", "el panel sabe que hay clave puesta")
ok(valor("dani", "select count(*) from negocio_salida") == "0", "un verificador no ve nada de la clave")

CL = "f" * 64
pri = valor("ana", f"select id from sucursales where negocio_id = '{A}' and es_principal")
valor(None, f"select public.solicitar_vinculo('{CL}')")
cod = valor(False, f"select codigo from vinculos where huella = public.huella_de('{CL}')")
valor("ana", f"select public.vincular_equipo('{cod}', '{pri}', 'Kiosco')")
st = json.loads(valor(None, f"select public.equipo_estado('{CL}')"))
r = st["salida"]
ok(r and hashlib.pbkdf2_hmac("sha256", b"4321", bytes.fromhex(r["sal"]), r["iter"]).hex() == r["hash"], "el equipo recibe la huella y comprueba «4321» sin internet")
ok(hashlib.pbkdf2_hmac("sha256", b"1111", bytes.fromhex(r["sal"]), r["iter"]).hex() != r["hash"], "otra clave no coincide")
ok(st["negocio"]["nombre"] == "Tienda Precios" and st["version"], "el resto del estado sigue igual")
valor("ana", f"select public.guardar_salida('{A}', null)")
ok(json.loads(valor(None, f"select public.equipo_estado('{CL}')"))["salida"] is None, "el dueño puede quitar la clave")
print(f"\n{c.bien} bien, {c.mal} mal")
