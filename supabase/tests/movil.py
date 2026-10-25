"""0009: consulta desde el celular. Correr al final (usa datos de los demás)."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _comun import *   # noqa: F401,F403
import _comun as c

A = valor("ana", "select id from negocios where nombre = 'Tienda Precios'")
slug = valor("ana", f"select slug from negocios where id = '{A}'")
pri = valor("ana", f"select id from sucursales where negocio_id = '{A}' and es_principal")
cen = valor("ana", f"select id from sucursales where negocio_id = '{A}' and codigo = 'centro'")
inv = valor("ana", f"insert into inventarios (negocio_id, nombre) values ('{A}', 'Movil') returning id")
valor("ana", f"""select public.reemplazar_productos('{inv}', '[{{"codigo":"042100005264","nombre":"Galletas","precio":95}}]')""")
valor("ana", f"update sucursales set fuente = jsonb_build_object('tipo','inventario','inventario_id','{inv}') where id = '{pri}'")
js = lambda v: json.loads(v) if v and v[0] in "{[" else v
def consulta(suc, formas, lat="null", lon="null"):
    arr = "array[" + ",".join(f"'{f}'" for f in formas) + "]::text[]"
    return js(valor(None, f"select public.consulta_movil('{suc}', {arr}, {lat}, {lon})"))

# apagada por defecto
r = js(valor(None, f"select public.movil_info('{slug}')"))
ok(r["activa"] is False and "sucursales" not in r, "apagada: la página pública no muestra nada del negocio")
ok(consulta(pri, ["042100005264"]) == {"error": "inactiva"}, "apagada: no da precios")
ok(valor(None, "select coalesce(public.movil_info('no-existe')::text, 'nada')") == "nada", "negocio que no existe: nada")
# activar: solo con la casilla Apariencia
valor("dani", f"update negocios set consulta_movil = true where id = '{A}'")
ok(valor("ana", f"select consulta_movil from negocios where id = '{A}'") == "f", "sin la casilla Apariencia no se activa")
valor("ana", f"update negocios set consulta_movil = true where id = '{A}'")
ok(valor("ana", f"select consulta_movil from negocios where id = '{A}'") == "t", "el dueño la activa")
r = js(valor(None, f"select public.movil_info('{slug}')"))
ok(r["activa"] and r["negocio"]["nombre"] == "Tienda Precios" and len(r["sucursales"]) >= 3, "activa: nombre y sucursales")
ok("latitud" not in json.dumps(r) and "inventario" not in json.dumps(r), "no publica la ubicación exacta ni datos internos")
r1 = js(valor(None, f"select public.movil_info('{slug}', 'centro')"))
ok([s["codigo"] for s in r1["sucursales"]] == ["centro"], "con sucursal: solo esa")
# sin ubicación
r = consulta(pri, ["04252614", "042100005264"])
ok(r.get("encontrado") and float(r["precio"]) == 95 and r["nombre"] == "Galletas", "sin ubicación activa: consulta (con las formas del código)")
ok(consulta(pri, ["999"]) == {"encontrado": False, "codigo": "999"}, "código que no está: no encontrado")
# con ubicación
valor("ana", f"update sucursales set latitud = 18.4861, longitud = -69.9312, radio_m = 150, geo_activa = true where id = '{pri}'")
ok(consulta(pri, ["042100005264"]) == {"error": "ubicacion"}, "ubicación activa: sin la del celular no da precios")
r = consulta(pri, ["042100005264"], 18.4870, -69.9312)
ok(r.get("encontrado"), "a ~100 m: da el precio")
r = consulta(pri, ["042100005264"], 18.5100, -69.9312)
ok(r.get("error") == "lejos" and 2500 < r["distancia_m"] < 2800 and r["radio_m"] == 150, f"a ~2.6 km: lejos {r}")
ok(consulta(pri, ["042100005264"], 95, 0) == {"error": "ubicacion"}, "coordenadas imposibles: rechazadas")
# registro y reporte
ok(valor("ana", f"select count(*) from consultas where sucursal_id = '{pri}' and canal = 'movil'") == "3", "cada consulta dada queda registrada (canal movil)")
ok(int(json.loads(valor("ana", f"select public.resumen_consultas('{A}', 7)"))["total"]) >= 3, "y aparece en el reporte")
# límite
valor(False, f"insert into consultas (negocio_id, sucursal_id, codigo, encontrado, canal) select '{A}', '{cen}', 'x', false, 'movil' from generate_series(1, 300)")
ok(consulta(cen, ["042100005264"]) == {"error": "limite"}, "más de 300 por minuto en una sucursal: frena")
# inactiva
valor("ana", f"update sucursales set activa = false where id = '{cen}'")
ok(consulta(cen, ["1"]) == {"error": "inactiva"}, "sucursal desactivada: no da precios")
ok(not puede(None, f"select public.consulta_movil('{pri}', array['{'1' * 65}'])"), "código demasiado largo: rechazado")
ok(not puede(None, "select public.distancia_m(0,0,0,0)"), "la función de distancia no se llama desde afuera")
print(f"\n{c.bien} bien, {c.mal} mal")
