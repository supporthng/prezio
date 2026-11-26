"""0025: Google Drive conectado por negocio (token cifrado, solo con permiso)."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _comun import *   # noqa: F401,F403
import _comun as c

A = nuevo_negocio("eva", "Drive Uno")
B = nuevo_negocio("ana", "Drive Dos")
ok(not A.startswith("ERROR") and not B.startswith("ERROR"), "dos negocios de prueba")
CIF = "v1.AAAAAAAAAAAAAAAAAAAAAAAA.cifradoDePrueba"

cta = valor("eva", f"select public.google_guardar_cuenta('{A}', ' Eva@Gmail.com ', '{CIF}')")
ok(len(cta) == 36, "la dueña conecta su Google Drive")
ok(not puede("ana", f"select public.google_guardar_cuenta('{A}', 'x@gmail.com', '{CIF}')"), "otro negocio no puede conectar Drive en el mío")
ok(not puede(None, f"select public.google_guardar_cuenta('{A}', 'x@gmail.com', '{CIF}')"), "anónimo tampoco")
ok(valor("eva", f"select public.google_guardar_cuenta('{A}', 'eva@gmail.com', '{CIF}2')") == cta, "reconectar la misma cuenta renueva el token (mismo id)")

lista = json.loads(valor("eva", f"select public.google_cuentas_de('{A}')"))
ok(len(lista) == 1 and lista[0]["correo"] == "eva@gmail.com" and "cifrado" not in lista[0], "la lista muestra el correo, nunca el token")
ok(json.loads(valor("ana", f"select public.google_cuentas_de('{A}')")) == [], "otro negocio no ve mis cuentas")
ok(not puede("eva", "select cifrado from google_cuentas"), "nadie lee la tabla directamente (ni la dueña)")
ok(not puede("ana", f"select public.google_cuenta_cifrada('{cta}')"), "otro negocio no obtiene mi token")
ok(valor("eva", f"select public.google_cuenta_cifrada('{cta}')") == CIF + "2", "la dueña sí (para que el servidor lo use)")
ok(valor("eva", f"select public.google_puede('{A}')") == "t" and valor("ana", f"select public.google_puede('{A}')") == "f", "permiso para conectar")

# tarea programada: solo entrega el token si la conexión es del mismo negocio
sec = valor(False, "select valor from ajustes_privados where clave = 'tareas_secreto'")
ia = valor(False, f"insert into inventarios (negocio_id, nombre, origen, estado) values ('{A}', 'Hoja A', '{{\"tipo\":\"google\",\"url\":\"https://docs.google.com/spreadsheets/d/xxxxxxxxxxxxxxxxxxxxxxxx/edit\",\"cuenta\":\"{cta}\"}}', '{{}}') returning id")
ib = valor(False, f"insert into inventarios (negocio_id, nombre, origen, estado) values ('{B}', 'Hoja B', '{{\"tipo\":\"google\",\"url\":\"https://docs.google.com/spreadsheets/d/yyyyyyyyyyyyyyyyyyyyyyyy/edit\",\"cuenta\":\"{cta}\"}}', '{{}}') returning id")
p = json.loads(valor(False, f"select public.google_pendientes('{sec}', 50)"))
por = {x["id"]: x for x in p}
ok(ia in por and por[ia]["cifrado"] == CIF + "2", "la tarea recibe el token cifrado de su propio negocio")
ok(ib in por and por[ib]["cifrado"] is None, "un inventario de otro negocio que apunte a mi conexión no recibe el token")

ok(not puede("ana", f"select public.google_quitar_cuenta('{cta}')"), "otro negocio no puede desconectarla")
ok(valor("eva", f"select public.google_quitar_cuenta('{cta}')") == CIF + "2", "desconectar devuelve el token para revocarlo en Google")
ok(json.loads(valor("eva", f"select public.google_cuentas_de('{A}')")) == [], "y la conexión desaparece")
valor(False, f"delete from negocios where id in ('{A}', '{B}')")
print(f"\n{c.bien} bien, {c.mal} mal")
sys.exit(1 if c.mal else 0)
