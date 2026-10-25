"""0007: límite de intentos de código, reporte de consultas y limpieza. Correr al final (usa datos de los demás)."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _comun import *   # noqa: F401,F403
import _comun as c

A = valor("ana", "select id from negocios where nombre = 'Tienda Precios'")
B = valor("beto", "select id from negocios where nombre = 'Otra Tienda'")
pri = valor("ana", f"select id from sucursales where negocio_id = '{A}' and es_principal")
centro = valor("ana", f"select id from sucursales where negocio_id = '{A}' and codigo = 'centro'")
priB = valor("beto", f"select id from sucursales where negocio_id = '{B}' and es_principal")

# ---------------------------------------------------------------- intentos de código
valor(False, "delete from intentos_codigo")
for i in range(10):
    valor("beto", f"select public.vincular_equipo('{i:08d}', '{priB}', 'x')")
ok(valor(False, f"select count(*) from intentos_codigo where user_id = '{U['beto']}'") == "10", "cada código equivocado queda anotado")
CL = "9" * 64
cod = json.loads(valor(None, f"select public.solicitar_vinculo('{CL}')"))["codigo"]
r = valor("beto", f"select public.vincular_equipo('{cod}', '{priB}', 'x')")
ok("Demasiados códigos" in r, "tras 10 fallos en 15 min, ni el código correcto pasa: hay que esperar")
ok(len(valor("ana", f"select public.vincular_equipo('{cod}', '{pri}', 'Caja nueva')")) == 36, "otro usuario sí puede (el límite es por usuario)")
valor(False, f"update intentos_codigo set creado = now() - interval '16 minutes' where user_id = '{U['beto']}'")
CL2 = "8" * 64
cod2 = json.loads(valor(None, f"select public.solicitar_vinculo('{CL2}')"))["codigo"]
ok(len(valor("beto", f"select public.vincular_equipo('{cod2}', '{priB}', 'x')")) == 36, "pasados 15 minutos vuelve a poder")

# ---------------------------------------------------------------- reporte
valor(False, f"delete from consultas where negocio_id = '{A}'")
filas = []
for cod_, enc, suc, dias in [("111", True, pri, 0)] * 5 + [("222", True, centro, 1)] * 3 + [("999", False, pri, 0)] * 4 + [("888", False, centro, 2)] * 2 + [("777", True, pri, 20)]:
    filas.append(f"('{A}', '{suc}', '{cod_}', {str(enc).lower()}, {'$$Pan$$' if cod_ == '111' else '$$Leche$$' if enc else 'null'}, now() - interval '{dias} days')")
valor(False, "insert into consultas (negocio_id, sucursal_id, codigo, encontrado, nombre, creado) values " + ",".join(filas))
r = json.loads(valor("ana", f"select public.resumen_consultas('{A}', 7)"))
ok(r["total"] == 14 and r["no_encontrados"] == 6, f"7 días: 14 consultas, 6 sin encontrar ({r['total']}, {r['no_encontrados']})")
ok(r["mas_buscados"][0] == {"codigo": "111", "nombre": "Pan", "veces": 5}, "lo más buscado primero")
ok([x["codigo"] for x in r["no_encontrados_top"]] == ["999", "888"] and r["no_encontrados_top"][0]["veces"] == 4, "códigos no encontrados, de más a menos")
ok(len(r["por_dia"]) == 3 and sum(d["total"] for d in r["por_dia"]) == 14, "por día")
ok({x["sucursal"]: x["total"] for x in r["por_sucursal"]} == {"Principal": 9, "Centro": 5}, "por sucursal")
r30 = json.loads(valor("ana", f"select public.resumen_consultas('{A}', 30)"))
ok(r30["total"] == 15, "30 días incluye la de hace 20 días")
rs = json.loads(valor("ana", f"select public.resumen_consultas('{A}', 7, '{centro}')"))
ok(rs["total"] == 5, "el dueño puede ver una sola sucursal")
rc = json.loads(valor("carla", f"select public.resumen_consultas('{A}', 7)"))
ok(rc["total"] == 5 and [x["sucursal"] for x in rc["por_sucursal"]] == ["Centro"], "la encargada solo ve su sucursal (aunque no la pida)")
rc2 = json.loads(valor("carla", f"select public.resumen_consultas('{A}', 7, '{pri}')"))
ok(rc2["total"] == 5, "…y aunque pida otra, ve solo la suya")
ok(not puede("beto", f"select public.resumen_consultas('{A}', 7)"), "otro negocio no ve tu reporte")
ok(not puede("dani", f"select public.resumen_consultas('{A}', 7)"), "un verificador no ve el reporte")
ok(not puede(None, f"select public.resumen_consultas('{A}', 7)"), "sin sesión no se ve")

# ---------------------------------------------------------------- limpieza
valor(False, f"insert into consultas (negocio_id, sucursal_id, codigo, encontrado, creado) values ('{A}', '{pri}', 'viejo', false, now() - interval '500 days')")
r = json.loads(valor(False, "select public.limpiar_datos()"))
ok(r["consultas"] == 1 and valor(False, "select count(*) from consultas where codigo = 'viejo'") == "0", "borra consultas de más de 13 meses")
ok(valor(False, f"select count(*) from consultas where negocio_id = '{A}'") == "15", "y deja las recientes")
ok(not puede("ana", "select public.limpiar_datos()") and not puede(None, "select public.limpiar_datos()"), "nadie la ejecuta desde la app")
print(f"\n{c.bien} bien, {c.mal} mal")
