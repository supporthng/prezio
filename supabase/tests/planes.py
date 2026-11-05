"""0015: planes editables, límites, por vencer/gracia, solicitudes, ajustes, historial, roles y PCs. Correr después de los demás."""
import json, os, sys, uuid
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _comun import *   # noqa: F401,F403
import _comun as c

J = lambda quien, q: json.loads(valor(quien, q))

# ---------------------------------------------------------------- 1. planes editables
datos = J("pat", "select public.plataforma_datos()")
ok(datos["rol"] == "administrador", "la plataforma de siempre queda como administrador")
codigos = [p["codigo"] for p in datos["planes"]]
ok("basico" in codigos and "profesional" in codigos, "nacen los planes Básico y Profesional")
ok(puede("pat", """select public.plataforma_guardar_plan('{"codigo":"mini","nombre":"Mini","precio":"9.50","periodo":"mensual",
    "max_sucursales":"1","max_equipos":"1","max_usuarios":"2","max_pcs":"1","funciones":["Un verificador"," ",""],"destacado":true,"etiqueta":"Nuevo"}')"""),
   "la plataforma crea un plan")
mini = next(p for p in J("pat", "select public.plataforma_datos()")["planes"] if p["codigo"] == "mini")
ok(float(mini["precio"]) == 9.5 and mini["funciones"] == ["Un verificador"] and mini["destacado"] and mini["max_equipos"] == 1,
   "con precio, funciones (sin vacías), destacado y límites")
ok(not puede("pat", """select public.plataforma_guardar_plan('{"codigo":"prueba","nombre":"X"}')"""), "«prueba» no puede ser un plan")
ok(not puede(False, "update negocios set plan = 'no-existe' where true"), "un negocio solo puede tener planes que existen")

# ---------------------------------------------------------------- 6. roles de la plataforma
ok(puede("pat", "select public.plataforma_poner_usuario('eva@x.com', 'ventas')"), "el administrador agrega a eva como ventas")
ok(puede("pat", "select public.plataforma_poner_usuario('dani@a.com', 'soporte')"), "y a dani como soporte")
ok(not puede("pat", "select public.plataforma_poner_usuario('nadie@x.com', 'ventas')"), "una cuenta que no existe: no")
ok(not puede("pat", "select public.plataforma_poner_usuario('pat@prezio.com', 'soporte')"), "no se quita a sí mismo el rol de administrador")
ok(not puede("eva", """select public.plataforma_guardar_plan('{"codigo":"otro","nombre":"Otro"}')"""), "ventas no cambia los planes")
ok(not puede("eva", "select public.plataforma_poner_usuario('dani@a.com', 'administrador')"), "ventas no maneja el equipo")
ok(J("dani", "select public.plataforma_datos()")["equipo"] is None, "soporte no ve el equipo de la plataforma")
ok(not puede("dani", "select public.plataforma_crear_negocio('De soporte')"), "soporte no crea negocios (solo mira)")
N = J("eva", "select public.plataforma_crear_negocio('Planes SA', 'planes-sa', 'RD$', 'mini')")["id"]
ok(len(N) == 36, "ventas sí da de alta un negocio, ya con un plan")
ok(puede("eva", f"select public.plataforma_poner_dueno('{N}', '{U['beto']}')"), "y le pone dueño")
ok(len(J("dani", "select public.plataforma_negocios()")) >= 1, "soporte ve los negocios")

# ---------------------------------------------------------------- 2. límites del plan
d = J("beto", f"select public.licencia_detalle('{N}')")
ok(d["limites"]["sucursales"] == 1 and d["uso"]["sucursales"] == 1, f"el negocio ve su límite y su uso ({d['uso']})")
r = valor("beto", f"insert into sucursales (negocio_id, codigo, nombre) values ('{N}', 'norte', 'Norte')")
ok(r.startswith("ERROR") and "Tu plan permite 1 sucursal" in r and "amplía tu plan" in r, "no deja crear la segunda sucursal: " + r[:90])
suc = valor("beto", f"select id from sucursales where negocio_id = '{N}'")
def vincular(nombre):
    clave = uuid.uuid4().hex + uuid.uuid4().hex
    cod = J(None, f"select public.solicitar_vinculo('{clave}')")["codigo"]
    return valor("beto", f"select public.vincular_equipo('{cod}', '{suc}', '{nombre}')")
ok(not vincular("Caja 1").startswith("ERROR"), "vincula el primer verificador")
r = vincular("Caja 2")
ok(r.startswith("ERROR") and "1 verificador" in r, "el segundo no (el plan permite 1): " + r[:80])
cuenta = str(uuid.uuid4())
valor(False, f"insert into auth.users (id, email) values ('{cuenta}', 'u1@planes.invalid')")
ok(puede(False, f"insert into miembros (negocio_id, user_id, rol) values ('{N}', '{cuenta}', 'verificador')"), "segundo usuario: cabe (2)")
cuenta2 = str(uuid.uuid4())
valor(False, f"insert into auth.users (id, email) values ('{cuenta2}', 'u2@planes.invalid')")
ok(not puede(False, f"insert into miembros (negocio_id, user_id, rol) values ('{N}', '{cuenta2}', 'verificador')"), "el tercero no")
ok(puede("eva", f"select public.plataforma_registrar_pago('{N}', 'profesional', 1)"), "al pasar a Profesional…")
ok(puede("beto", f"insert into sucursales (negocio_id, codigo, nombre) values ('{N}', 'norte', 'Norte')"), "…ya crea la segunda sucursal")
ok(not vincular("Caja 2").startswith("ERROR"), "…y otro verificador")

# ---------------------------------------------------------------- 5. ajustes de la plataforma
ok(puede("pat", """select public.plataforma_guardar_ajustes('{"contacto_nombre":"Soporte Prezcio","contacto_whatsapp":"809-555-0000",
    "dias_prueba":"20","dias_aviso":"10","dias_gracia":"5","plazo_horas":"48","descuento_anual":"15","prueba_sucursales":"1","prueba_pcs":"1"}')"""),
   "el administrador guarda contacto y reglas")
ok(not puede("eva", """select public.plataforma_guardar_ajustes('{"dias_prueba":"90"}')"""), "ventas no cambia las reglas")
d = J("beto", f"select public.licencia_detalle('{N}')")
ok(d["contacto"]["whatsapp"] == "809-555-0000" and d["plazo_horas"] == 48 and d["descuento_anual"] == 15, "el negocio ve el contacto y el plazo")
P = J("pat", "select public.plataforma_crear_negocio('Prueba Nueva')")["id"]
dias = int(valor(False, f"select ceil(extract(epoch from prueba_hasta - now()) / 86400) from negocios where id = '{P}'"))
ok(dias == 20, f"los negocios nuevos nacen con los días de prueba de las reglas ({dias})")
ok(not puede(False, f"insert into sucursales (negocio_id, codigo, nombre) values ('{P}', 'b', 'B')"), "y con los límites de la prueba")
valor("pat", """select public.plataforma_guardar_ajustes('{"dias_prueba":"30","dias_aviso":"15","dias_gracia":"7","plazo_horas":"48","descuento_anual":"15",
    "contacto_nombre":"Soporte Prezcio","contacto_whatsapp":"809-555-0000","prueba_pcs":"1"}')""")

# ---------------------------------------------------------------- 1. pago con monto y plan permanente
p = J("eva", f"select public.plataforma_registrar_pago('{N}', 'mini', 12, 'Anual')")
ok(float(p["monto"]) == round(9.5 * 12 * 0.85, 2), f"12 meses de un plan mensual: con el descuento anual ({p['monto']})")
valor("pat", """select public.plataforma_guardar_plan('{"codigo":"para-siempre","nombre":"Para siempre","precio":"300","permanente":true,"max_pcs":"3"}')""")
p = J("eva", f"select public.plataforma_registrar_pago('{N}', 'para-siempre', null)")
est = J("beto", f"select public.negocio_licencia('{N}')")
ok(p["permanente"] and est["estado"] == "activa" and est["vence"] is None and est["permanente"], "plan permanente: activa y sin vencimiento")
ok(valor("pat", "select public.plataforma_borrar_plan('para-siempre')") == "desactivado", "un plan en uso no se borra: se desactiva")
ok(valor("pat", """select public.plataforma_guardar_plan('{"codigo":"temporal","nombre":"Temporal"}'), public.plataforma_borrar_plan('temporal')""").endswith("borrado"),
   "uno sin uso sí se borra")

# ---------------------------------------------------------------- 4. solicitudes
valor("eva", f"select public.plataforma_registrar_pago('{N}', 'mini', 1)")
ok(not puede("carla", f"select public.solicitar_plan('{N}', 'profesional', 3, 'Carla', '8095550000')"), "alguien de otro negocio no pide planes")
ok(not puede("beto", f"select public.solicitar_plan('{N}', 'profesional', 3, 'Beto', '12')"), "sin teléfono válido: no")
S1 = valor("beto", f"select public.solicitar_plan('{N}', 'profesional', 3, 'Beto Gómez', '809-555-1234', 'beto@b.com', 'Llamar de tarde', 'app')")
ok(len(S1) == 36, "el dueño pide el plan Profesional por 3 meses")
S2 = valor("beto", f"select public.solicitar_plan('{N}', 'profesional', 6, 'Beto Gómez', '809-555-1234')")
ok(S1 == S2, "una sola solicitud abierta por negocio: la segunda la actualiza")
d = J("beto", f"select public.licencia_detalle('{N}')")
ok(d["solicitud"]["estado"] == "nueva" and d["solicitud"]["meses"] == 6 and d["puede_pedir"], "el negocio ve su solicitud en curso")
sol = J("pat", "select public.plataforma_datos()")["solicitudes"]
ok(any(s["id"] == S1 and s["origen"] == "app" and s["telefono"] == "809-555-1234" for s in sol), "llega a la bandeja de la plataforma")
ok(not puede("dani", f"select public.plataforma_atender_solicitud('{S1}', 'aprobar')"), "soporte no aprueba")
ok(valor("eva", f"select public.plataforma_atender_solicitud('{S1}', 'contactada', null, 'Le escribimos por WhatsApp')") == "contactada", "ventas la marca como contactada")
ok(valor("eva", f"select public.plataforma_atender_solicitud('{S1}', 'aprobar', 6)") == "aprobar", "y la aprueba")
est = J("beto", f"select public.negocio_licencia('{N}')")
ok(est["plan"] == "profesional" and est["dias"] >= 170, f"aprobada: el negocio queda en Profesional por 6 meses ({est['dias']} días)")
ok(not puede("eva", f"select public.plataforma_atender_solicitud('{S1}', 'aprobar')"), "no se aprueba dos veces")
S3 = valor("beto", f"select public.solicitar_plan('{N}', 'mini', 1, 'Beto', '809-555-1234')")
valor("eva", f"select public.plataforma_atender_solicitud('{S3}', 'rechazar', null, 'Ese plan no tiene tantas sucursales')")
d = J("beto", f"select public.licencia_detalle('{N}')")
ok(d["solicitud"]["estado"] == "rechazada" and "sucursales" in d["respuesta"], "rechazada: el negocio ve el motivo")
S4 = valor("beto", f"select public.solicitar_plan('{N}', 'mini', 1, 'Beto', '809-555-1234')")
valor("beto", f"select public.cancelar_solicitud('{N}')")
ok(valor(False, f"select estado from solicitudes_plan where id = '{S4}'") == "cancelada", "el negocio puede cancelar su solicitud")

# ---------------------------------------------------------------- 7. PCs de Prezcio Administrador
L = valor("pat", f"select public.plataforma_licencia_de('{N}')")
valor("eva", f"select public.plataforma_registrar_pago('{N}', 'mini', 1)")     # Mini: 1 PC
PC1, PC2 = str(uuid.uuid4()), str(uuid.uuid4())
ok(J(None, f"select public.activar_pc('{L}', '{PC1}', 'CAJA-01', '2.0.31')")["id"] == N, "la app se activa en la primera PC")
ok(valor(None, f"select public.pc_estado('{L}', '{PC1}', '2.0.31')") == "activa", "al abrir: esta PC sigue activa")
ok(J(None, f"select public.activar_pc('{L}', '{PC1}', 'CAJA-01')")["id"] == N, "volver a activar la misma PC: sin problema")
r = valor(None, f"select public.activar_pc('{L}', '{PC2}', 'OFICINA')")
ok(r.startswith("ERROR") and "CAJA-01" in r and "libere" in r, "en una segunda PC no (el plan permite 1): " + r[:90])
ok(valor(None, f"select public.pc_estado('{L}', '{PC2}')") == "nueva", "una PC que nunca se activó: «nueva»")
ok(valor(None, f"select coalesce(public.activar_pc('{N}', '{PC2}')::text, 'nada')") == "nada", "con la dirección o el id (no la licencia): nada")
d = J("beto", f"select public.licencia_detalle('{N}')")
ok(len(d["pcs"]) == 1 and d["pcs"][0]["nombre"] == "CAJA-01" and d["uso"]["pcs"] == 1, "el negocio ve en qué PC está activa")
h = J("pat", f"select public.plataforma_historial('{N}')")
pc = next(x for x in h["pcs"] if x["nombre"] == "CAJA-01")
ok(not puede("dani", f"select public.plataforma_liberar_pc('{pc['id']}')"), "soporte no libera PCs")
valor("eva", f"select public.plataforma_liberar_pc('{pc['id']}')")
ok(valor(None, f"select public.pc_estado('{L}', '{PC1}')") == "liberada", "liberada desde la plataforma: la app lo sabe al abrir")
ok(J(None, f"select public.activar_pc('{L}', '{PC2}', 'OFICINA')")["id"] == N, "y ahora se activa en la otra PC")

# ---------------------------------------------------------------- 6. historial
tipos = [e["tipo"] for e in J("pat", f"select public.plataforma_historial('{N}')")["eventos"]]
for t in ("alta", "pago", "plan", "solicitud", "solicitud_aprobada", "solicitud_rechazada", "pc_activada", "pc_liberada"):
    ok(t in tipos, f"historial: «{t}»")
quien = next(e for e in J("pat", f"select public.plataforma_historial('{N}')")["eventos"] if e["tipo"] == "pago")["quien"]
ok(quien == "eva@x.com", f"el historial dice quién lo hizo ({quien})")
ok(not puede("beto", f"select public.plataforma_historial('{N}')"), "el negocio no ve el historial interno de la plataforma")

# ---------------------------------------------------------------- 3. suspender y reactivar vuelve al plan que tenía
valor("eva", f"select public.plataforma_cambiar_plan('{N}', 'suspendido')")
est = J("beto", f"select public.negocio_licencia('{N}')")
ok(est["estado"] == "suspendida" and est["plan_antes"] == "mini", "suspendido recuerda su plan")
ok(valor("eva", f"select public.plataforma_reactivar('{N}')") == "mini", "al quitar la suspensión vuelve a su plan pagado")
tipos = [e["tipo"] for e in J("pat", f"select public.plataforma_historial('{N}')")["eventos"]]
ok("suspendida" in tipos and "reactivada" in tipos, "y queda anotado")

ok(puede("pat", f"select public.plataforma_quitar_usuario('{U['eva']}')"), "el administrador quita a eva de la plataforma")
ok(not puede("eva", "select public.plataforma_datos()"), "y eva ya no entra")
print(f"\n{c.bien} bien, {c.mal} mal")
