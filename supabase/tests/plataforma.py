"""0010: la plataforma da de alta, suspende y reactiva negocios. Correr después de los demás."""
import json, os, sys, uuid
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _comun import *   # noqa: F401,F403
import _comun as c

# ---------------------------------------------------------------- quién es plataforma
ok(valor("pat", "select public.es_plataforma()") == "t", "pat administra la plataforma")
ok(valor("ana", "select public.es_plataforma()") == "f", "un dueño cualquiera no es plataforma")
ok(not puede("ana", "select public.plataforma_negocios()"), "un dueño no ve la lista de negocios de la plataforma")
ok(not puede("ana", "select public.plataforma_crear_negocio('Colado')"), "un dueño no da de alta negocios")
ok(not puede(None, "select public.agregar_admin_plataforma('eva@x.com')"), "nadie se hace plataforma desde la página (sin sesión)")
ok(not puede("ana", "select public.agregar_admin_plataforma('ana@a.com')"), "nadie se hace plataforma desde la página (con sesión)")
ok(not puede("ana", "select public.crear_negocio('Por mi cuenta')"), "el registro público de negocios está cerrado")

# ---------------------------------------------------------------- alta con usuario y clave
r = json.loads(valor("pat", "select public.plataforma_crear_negocio('Abarrotao Market', 'abarrotao-market', 'RD$', 'basico')"))
N = r["id"]
ok(r["slug"] == "abarrotao-market", "alta con el código pedido (abarrotao-market)")
ok(valor(False, f"select count(*) from sucursales where negocio_id = '{N}' and es_principal") == "1", "nace con su sucursal Principal")
ok(valor(False, f"select plan from negocios where id = '{N}'") == "basico", "nace con el plan elegido")
ok(not puede("pat", "select public.plataforma_crear_negocio('Otro', 'abarrotao-market')"), "no repite un código de negocio")
ok(not puede("pat", "select public.plataforma_crear_negocio('Otro', 'Con Espacios')"), "código con espacios o mayúsculas: rechazado")
ok(not puede("pat", "select public.plataforma_crear_negocio('Otro', null, 'RD$', 'suspendido')"), "no nace suspendido")
due = str(uuid.uuid4())
valor(False, f"insert into auth.users (id, email) values ('{due}', public.correo_de_usuario('{N}', 'rosa'))")
ok(puede("pat", f"select public.plataforma_poner_dueno('{N}', '{due}', 'rosa', 'Rosa Pérez')"), "le pone de dueña a la cuenta sin correo «rosa»")
ok(valor(False, f"select rol || '|' || usuario || '|' || array_to_string(permisos, ',') from miembros where negocio_id = '{N}' and user_id = '{due}'")
   == "dueno|rosa|reportes,inventarios,sucursales,equipos,apariencia,usuarios", "rosa es dueña con todas las casillas")
ok(valor(False, f"select nombre from perfiles where id = '{due}'") == "Rosa Pérez", "guarda su nombre")
otro = str(uuid.uuid4())
valor(False, f"insert into auth.users (id, email) values ('{otro}', public.correo_de_usuario('{N}', 'luis'))")
ok(not puede("pat", f"select public.plataforma_poner_dueno('{N}', '{otro}', 'pedro')"), "el usuario debe coincidir con su cuenta interna")
ok(not puede("ana", f"select public.plataforma_poner_dueno('{N}', '{U['ana']}')"), "un dueño no se pone de dueño en otro negocio")

# ---------------------------------------------------------------- alta con correo
r2 = json.loads(valor("pat", "select public.plataforma_crear_negocio('Colmado Eva')"))
ok(r2["slug"] == "colmado-eva", "sin código: se arma del nombre")
ok(valor("pat", "select public.plataforma_cuenta_de_correo('EVA@x.com')") == U["eva"], "encuentra la cuenta que ya existía por su correo")
ok(valor("pat", "select coalesce(public.plataforma_cuenta_de_correo('nadie@x.com')::text, 'nada')") == "nada", "correo sin cuenta: hay que invitarlo")
ok(not puede("ana", "select public.plataforma_cuenta_de_correo('eva@x.com')"), "un dueño no averigua qué correos tienen cuenta")
ok(puede("pat", f"select public.plataforma_poner_dueno('{r2['id']}', '{U['eva']}')"), "eva (con correo) queda de dueña")
ok(not puede("pat", f"select public.plataforma_poner_dueno('{r2['id']}', '{due}')"), "una cuenta de usuario de otro negocio no puede ser dueña aquí")

lista = json.loads(valor("pat", "select public.plataforma_negocios()"))
fila = next(x for x in lista if x["id"] == N)
ok(fila["duenos"] == [{"usuario": "rosa", "correo": None, "confirmado": True}] and fila["sucursales"] == 1,
   f"la lista muestra dueños y conteos {fila['duenos']}")
ok(next(x for x in lista if x["id"] == r2["id"])["duenos"][0]["correo"] == "eva@x.com", "y el correo del dueño invitado")

# ---------------------------------------------------------------- suspender
A = valor("ana", "select id from negocios where nombre = 'Tienda Precios'")
pri = valor("ana", f"select id from sucursales where negocio_id = '{A}' and es_principal")
clave_eq = "eq_" + uuid.uuid4().hex + uuid.uuid4().hex
valor(False, f"insert into equipos (negocio_id, sucursal_id, nombre, huella) values ('{A}', '{pri}', 'Caja plataforma', public.huella_de('{clave_eq}'))")
ok(not puede("ana", f"select public.plataforma_cambiar_plan('{A}', 'suspendido')"), "un dueño no se cambia el plan")
ok(puede("pat", f"select public.plataforma_cambiar_plan('{A}', 'suspendido')"), "la plataforma suspende el negocio")
ok(valor("ana", f"select public.puede('{A}', 'inventarios')") == "f", "suspendido: el dueño ya no puede cambiar nada")
ok(not puede("ana", f"update negocios set nombre = 'Cambio' where id = '{A}' returning id") or
   valor("ana", f"with x as (update negocios set nombre = 'Cambio' where id = '{A}' returning id) select count(*) from x") == "0",
   "suspendido: no cambia el nombre")
ok(valor("ana", f"select count(*) from sucursales where negocio_id = '{A}'") != "0", "suspendido: el dueño todavía VE sus datos")
est = json.loads(valor(False, f"select public.equipo_estado('{clave_eq}')"))
ok(est["negocio"]["suspendido"] is True and est["version"] == "suspendido", "el verificador se entera de que está suspendido")
ok(json.loads(valor(False, f"select public.equipo_catalogo('{clave_eq}')"))["productos"] == [], "y no recibe precios")
ok(not puede("ana", f"select public.consultar_precio('{pri}', array['7501055363063'])"), "suspendido: el verificador en línea no da precios")
valor(False, f"update negocios set consulta_movil = true where id = '{A}'")
ok(json.loads(valor(None, f"select public.consulta_movil('{pri}', array['7501055363063'], null, null)")).get("error") == "inactiva",
   "suspendido: la consulta desde el celular se apaga")
slug = valor(False, f"select slug from negocios where id = '{A}'")
ok(json.loads(valor(None, f"select public.movil_info('{slug}')"))["activa"] is False, "suspendido: la página del celular dice que no está activa")
ok(puede("pat", f"select public.plataforma_cambiar_plan('{A}', 'profesional')"), "la plataforma lo reactiva")
ok(valor("ana", f"select public.puede('{A}', 'inventarios')") == "t", "reactivado: el dueño vuelve a poder")
ok(json.loads(valor(False, f"select public.equipo_estado('{clave_eq}')"))["negocio"]["suspendido"] is False,
   "reactivado: el mismo verificador sigue vinculado y vuelve a dar precios")
valor(False, f"delete from equipos where huella = public.huella_de('{clave_eq}')")

# ---------------------------------------------------------------- conector de la app de administrador
cx = json.loads(valor("ana", f"select public.conector_para_app('{A}', 'PC Caja 1')"))
ok(cx["clave"].startswith("pzc_") and len(cx["clave"]) > 60, "la app crea su conector y recibe la clave una sola vez")
ok(json.loads(valor(None, f"select public.conector_estado('{cx['clave']}')"))["conector"]["id"] == cx["id"], "esa clave ya sirve para el conector")
ok(not puede("beto", f"select public.conector_para_app('{A}', 'Intruso')"), "otro negocio no crea conectores aquí")
valor("pat", f"select public.plataforma_cambiar_plan('{A}', 'suspendido')")
ok(not puede(None, f"select public.conector_estado('{cx['clave']}')"), "suspendido: el conector deja de enviar precios")
valor("pat", f"select public.plataforma_cambiar_plan('{A}', 'prueba')")
valor(False, f"delete from conectores where id = '{cx['id']}'")

# ---------------------------------------------------------------- deshacer un alta incompleta
r3 = json.loads(valor("pat", "select public.plataforma_crear_negocio('Alta fallida')"))
ok(puede("pat", f"select public.plataforma_borrar_negocio('{r3['id']}')"), "se puede deshacer un alta recién creada")
ok(not puede("pat", f"select public.plataforma_borrar_negocio('{A}')"), "un negocio con datos no se borra (se suspende)")

print(f"{c.bien} bien, {c.mal} mal")
