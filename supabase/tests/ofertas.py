"""0017: ofertas en el verificador. Correr después de precios.py (usa «Tienda Precios» de Ana)."""
import json, os, sys, uuid
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _comun import *   # noqa: F401,F403
import _comun as c

J = lambda quien, q: json.loads(valor(quien, q))
A = valor(False, "select id from negocios where nombre = 'Tienda Precios'")
pri = valor(False, f"select id from sucursales where negocio_id = '{A}' and es_principal")
norte = valor(False, f"select id from sucursales where negocio_id = '{A}' and codigo = 'norte'")
B = valor(False, "select id from negocios where nombre = 'Otra Tienda'")
REF, GAL = "7501055363063", "042100005264"
base = J("ana", f"select public.consultar_precio('{pri}', array['{REF}'])")["precio"]

def guardar(quien, datos, neg=A):
    return valor(quien, f"select public.guardar_oferta('{neg}', '{json.dumps(datos)}'::jsonb)")

# ---------------------------------------------------------------- crear y validar
r = guardar("ana", {"nombre": "Refresco a 99", "tipo": "precio", "productos": [{"codigo": REF, "precio": "99"}, {"codigo": "000999", "precio": "5"}]})
ok(r.startswith("{"), "la dueña crea una oferta de precio especial")
o1 = json.loads(r)
ok(o1["sin_encontrar"] == ["000999"], "avisa qué códigos no están en ningún inventario")
ok(not puede("ana", f"""select public.guardar_oferta('{A}', '{{"nombre":"Sin precio","tipo":"precio","productos":[{{"codigo":"{REF}"}}]}}')"""),
   "precio especial sin precio: no")
ok(not puede("ana", f"""select public.guardar_oferta('{A}', '{{"nombre":"Vacía","tipo":"porcentaje","valor":"10","productos":[]}}')"""),
   "una oferta de productos sin productos: no")
ok(not puede("ana", f"""select public.guardar_oferta('{A}', '{{"nombre":"Rara","tipo":"lleva_paga","lleva":"2","paga":"3","productos":[{{"codigo":"{REF}"}}]}}')"""),
   "«lleva 2, paga 3»: no")
ok(not puede("beto", f"""select public.guardar_oferta('{A}', '{{"nombre":"Ajena","tipo":"aviso"}}')"""), "alguien de otro negocio no crea ofertas aquí")
ok(not puede("ana", f"""select public.guardar_oferta('{A}', '{{"nombre":"Con sucursal ajena","tipo":"aviso","sucursales":["{valor(False, f"select id from sucursales where negocio_id = '{B}' limit 1")}"]}}')"""),
   "con una sucursal de otro negocio: no")
ok(valor("beto", f"select count(*) from ofertas where negocio_id = '{A}'") == "0", "otro negocio no ve las ofertas")

# ---------------------------------------------------------------- la consulta trae la oferta
r = J("ana", f"select public.consultar_precio('{pri}', array['{REF}'])")
ok(r["precio"] == base and r["oferta"]["precio_oferta"] == 99 and r["oferta"]["nombre"] == "Refresco a 99",
   f"al consultar: precio normal {base} y de oferta 99")
r = J("ana", f"select public.consultar_precio('{pri}', array['{GAL}'])")
ok(r["oferta"] is None, "un producto sin oferta: sin oferta")
guardar("ana", {"nombre": "Todo 20%", "tipo": "porcentaje", "valor": "20", "productos": [{"codigo": REF}, {"codigo": GAL}]})
r = J("ana", f"select public.consultar_precio('{pri}', array['{REF}'])")
ok(r["oferta"]["precio_oferta"] == round(base * 0.8, 2) if round(base * 0.8, 2) < 99 else r["oferta"]["precio_oferta"] == 99,
   f"con dos ofertas gana la que deja el precio más bajo ({r['oferta']['precio_oferta']})")
r = J("ana", f"select public.consultar_precio('{pri}', array['{GAL}'])")
ok(r["oferta"]["precio_oferta"] == 76 and "20% de descuento" == r["oferta"]["texto"], "20% sobre 95 = 76")
o3 = J("ana", f"""select public.guardar_oferta('{A}', '{{"nombre":"3x2 galletas","tipo":"lleva_paga","lleva":"3","paga":"2","productos":[{{"codigo":"{GAL}"}}],"orden":"1"}}')""")
valor("ana", f"select public.pausar_oferta((select id from ofertas where nombre = 'Todo 20%'), false)")
r = J("ana", f"select public.consultar_precio('{pri}', array['{GAL}'])")
ok(r["oferta"]["tipo"] == "lleva_paga" and r["oferta"]["precio_oferta"] is None and r["oferta"]["texto"] == "Lleva 3, paga 2",
   "«lleva 3, paga 2»: no cambia el precio por unidad, lo anuncia")

# ---------------------------------------------------------------- vigencia
valor("ana", f"select public.pausar_oferta('{o3['id']}', false)")
mañana = valor(False, "select (now() + interval '1 day')::text")
o4 = J("ana", f"""select public.guardar_oferta('{A}', '{{"nombre":"Mañana","tipo":"precio","desde":"{mañana}","productos":[{{"codigo":"{GAL}","precio":"50"}}]}}')""")
ok(J("ana", f"select public.consultar_precio('{pri}', array['{GAL}'])")["oferta"] is None, "una oferta que empieza mañana todavía no aplica")
ok(any(o["nombre"] == "Mañana" for o in J("ana", f"select public.ofertas_sucursal('{pri}')")),
   "pero el verificador ya la recibe (para mostrarla sin internet cuando empiece)")
hoy = int(valor(False, "select extract(dow from now() at time zone 'America/Santo_Domingo')"))
otro = (hoy + 3) % 7
guardar("ana", {"id": o4["id"], "nombre": "Mañana", "tipo": "precio", "dias": [otro], "productos": [{"codigo": GAL, "precio": "50"}]})
ok(J("ana", f"select public.consultar_precio('{pri}', array['{GAL}'])")["oferta"] is None, "solo otro día de la semana: hoy no aplica")
guardar("ana", {"id": o4["id"], "nombre": "Mañana", "tipo": "precio", "dias": [hoy, otro], "productos": [{"codigo": GAL, "precio": "50"}]})
ok(J("ana", f"select public.consultar_precio('{pri}', array['{GAL}'])")["oferta"]["precio_oferta"] == 50, "incluyendo hoy: aplica")
guardar("ana", {"id": o4["id"], "nombre": "Mañana", "tipo": "precio", "sucursales": [norte], "productos": [{"codigo": GAL, "precio": "50"}]})
ok(J("ana", f"select public.consultar_precio('{pri}', array['{GAL}'])")["oferta"] is None, "solo para la sucursal Norte: en la Principal no")
ayer = valor(False, "select (now() - interval '1 day')::text")
guardar("ana", {"id": o4["id"], "nombre": "Mañana", "tipo": "precio", "hasta": ayer, "productos": [{"codigo": GAL, "precio": "50"}]})
ok(not any(o["nombre"] == "Mañana" for o in J("ana", f"select public.ofertas_sucursal('{pri}')")), "una oferta vencida ya no se envía")

# ---------------------------------------------------------------- lo que recibe la pantalla
of = J("ana", f"select public.ofertas_sucursal('{pri}')")
r99 = next(o for o in of if o["nombre"] == "Refresco a 99")
ok(r99["productos"] == [[REF, "Refresco 2L", base, 99]], f"cada producto con su nombre, precio y precio de oferta: {r99['productos']}")
o5 = J("ana", f"""select public.guardar_oferta('{A}', '{{"nombre":"Feria de quesos","tipo":"aviso","descripcion":"Sábado y domingo","imagen":"https://x.supabase.co/q.jpg"}}')""")
ok(any(o["tipo"] == "aviso" and o["imagen"] for o in J("ana", f"select public.ofertas_sucursal('{pri}')")), "un anuncio con imagen, sin productos")
ok(not puede("beto", f"select public.ofertas_sucursal('{pri}')"), "otro negocio no ve las ofertas de esta sucursal")

# ---------------------------------------------------------------- verificadores (con su clave)
clave = uuid.uuid4().hex + uuid.uuid4().hex
cod = J(None, f"select public.solicitar_vinculo('{clave}')")["codigo"]
valor("ana", f"select public.vincular_equipo('{cod}', '{pri}', 'Caja ofertas')")
e = J(None, f"select public.equipo_ofertas('{clave}')")
ok(len(e["ofertas"]) >= 2 and len(e["version"]) == 32, f"el verificador recibe {len(e['ofertas'])} ofertas")
e2 = J(None, f"select public.equipo_ofertas('{clave}', '{e['version']}')")
ok("ofertas" not in e2, "si no cambiaron, no las vuelve a mandar")
valor("ana", f"select public.borrar_oferta('{o5['id']}')")
e3 = J(None, f"select public.equipo_ofertas('{clave}', '{e['version']}')")
ok("ofertas" in e3 and e3["version"] != e["version"], "si cambian, sí")
ok(valor(None, f"select public.equipo_ofertas('{'0' * 64}')").startswith("ERROR"), "con una clave falsa: nada")

# ---------------------------------------------------------------- consulta móvil
valor(False, f"update negocios set consulta_movil = true where id = '{A}'")
m = J(None, f"select public.consulta_movil('{pri}', array['{REF}'])")
ok(m["oferta"]["precio_oferta"] == 99, "la consulta desde el celular también trae la oferta")

# ---------------------------------------------------------------- permisos
ok(not puede("dani", f"select public.borrar_oferta('{o1['id']}')"), "sin el permiso de Inventarios no se borran")
ok(puede("ana", f"select public.borrar_oferta('{o1['id']}')"), "la dueña sí")

# Deja la base como estaba para las pruebas que siguen.
valor(False, f"update negocios set consulta_movil = false where id = '{A}'")
valor(False, f"delete from consultas where negocio_id = '{A}' and canal = 'movil'")
valor(False, f"delete from equipos where negocio_id = '{A}' and nombre = 'Caja ofertas'")
valor(False, f"delete from ofertas where negocio_id = '{A}'")
print(f"\n{c.bien} bien, {c.mal} mal")
