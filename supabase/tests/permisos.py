"""0008: usuarios sin correo y permisos por casillas. Correr después de los demás (usa sus datos)."""
import json, os, sys, uuid
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _comun import *   # noqa: F401,F403
import _comun as c

A = valor("ana", "select id from negocios where nombre = 'Tienda Precios'")
B = valor("beto", "select id from negocios where nombre = 'Otra Tienda'")
pri = valor("ana", f"select id from sucursales where negocio_id = '{A}' and es_principal")
cen = valor("ana", f"select id from sucursales where negocio_id = '{A}' and codigo = 'centro'")
nor = valor("ana", f"select id from sucursales where negocio_id = '{A}' and codigo = 'norte'")
slug = valor("ana", f"select slug from negocios where id = '{A}'")

ok(valor("ana", f"select array_to_string(permisos, ',') from miembros where negocio_id = '{A}' and user_id = '{U['ana']}'")
   == "reportes,inventarios,sucursales,equipos,apariencia,usuarios", "el dueño tiene todas las casillas")
# un encargado por invitación recibe las casillas de su rol, solo en su sucursal
valor(False, f"insert into miembros (negocio_id, user_id, rol, sucursal_id) values ('{A}', '{U['carla']}', 'encargado', '{cen}') on conflict (negocio_id, user_id) do update set rol = 'encargado', sucursal_id = excluded.sucursal_id")
ok(valor(False, f"select array_to_string(permisos, ',') || '|' || array_to_string(sucursales, ',') from miembros where negocio_id = '{A}' and user_id = '{U['carla']}'")
   == f"reportes,sucursales,equipos|{cen}", "encargado por invitación: reportes, sucursales y equipos de SU sucursal")

# ---------------------------------------------------------------- usuarios sin correo
ok(valor(None, f"select public.negocio_de_slug('{slug}')") == A, "sin sesión se obtiene el negocio por su código (para entrar)")
ok(valor(None, "select coalesce(public.negocio_de_slug('no-existe')::text, 'nada')") == "nada", "código que no existe: nada")
correo = valor(None, f"select public.correo_de_usuario('{A}', ' Juan ')")
ok(correo == f"juan@n{A.replace('-', '')}.prezio.invalid", f"correo interno del usuario ({correo})")

def cuenta(usuario, negocio=A):
    i = str(uuid.uuid4())
    valor(False, f"insert into auth.users (id, email) values ('{i}', public.correo_de_usuario('{negocio}', '{usuario}'))")
    return i
juan = cuenta("juan")
ok(not puede("dani", f"select public.agregar_usuario('{A}', '{juan}', 'juan', 'Juan', array['inventarios'], null)"), "sin la casilla «usuarios» no se crean usuarios")
falsa = str(uuid.uuid4()); valor(False, f"insert into auth.users (id, email) values ('{falsa}', 'alguien@gmail.com')")
ok(not puede("ana", f"select public.agregar_usuario('{A}', '{falsa}', 'pedro', 'Pedro', array['inventarios'], null)"), "no se puede meter una cuenta ajena con correo real")
ok(not puede("ana", f"select public.agregar_usuario('{A}', '{juan}', 'otro', 'X', array['inventarios'], null)"), "la cuenta debe ser la de ESE usuario")
ok(puede("ana", f"select public.agregar_usuario('{A}', '{juan}', 'juan', 'Juan Pérez', array['inventarios'], null)"), "el dueño crea a «juan» con la casilla inventarios")
ok(valor("ana", f"select usuario || '|' || rol || '|' || array_to_string(permisos, ',') from miembros where user_id = '{juan}'") == "juan|verificador|inventarios", "juan: usuario, etiqueta de empleado y su casilla")
ok(valor("ana", f"select nombre from perfiles where id = '{juan}'") == "Juan Pérez", "con su nombre")
juan2 = cuenta("juan")
ok(not puede("ana", f"select public.agregar_usuario('{A}', '{juan2}', 'juan', 'Otro', array[]::text[], null)"), "no se repite un usuario en el mismo negocio")
ok(not puede("ana", "update miembros set permisos = array['usuarios'] where usuario = 'juan'"), "las casillas no se cambian directo en la tabla")

def comoU(i): return f"set role authenticated; select set_config('request.jwt.claim.sub', '{i}', false) \\g /dev/null\n"
def sqlu(i, q):
    r, v = sql(False, comoU(i) + q); return r, v
def pu(i, q): return sqlu(i, q)[0]
def vu(i, q): r, v = sqlu(i, q); return v if r else "ERROR: " + v

# ---------------------------------------------------------------- cada casilla abre solo lo suyo
ok(pu(juan, f"insert into inventarios (negocio_id, nombre) values ('{A}', 'De Juan')"), "inventarios: juan crea un inventario")
inv = vu(juan, f"select id from inventarios where negocio_id = '{A}' and nombre = 'De Juan'")
ok(vu(juan, f"select public.cargar_inventario('{inv}', '{uuid.uuid4()}', '[{{\"codigo\":\"1\",\"nombre\":\"Uno\",\"precio\":1}}]', true)") == "1", "inventarios: juan carga productos")
ok(pu(juan, f"select public.crear_conector('{A}', 'PC de Juan')"), "inventarios: juan crea un conector")
vu(juan, f"update negocios set nombre = 'Hackeado' where id = '{A}'")
ok(valor("ana", f"select nombre from negocios where id = '{A}'") == "Tienda Precios", "sin apariencia: juan no cambia el negocio")
ok(not pu(juan, f"insert into sucursales (negocio_id, codigo, nombre) values ('{A}', 'juanito', 'Juanito')"), "sin sucursales: juan no crea sucursales")
ok(vu(juan, f"select count(*) from consultas where negocio_id = '{A}'") == "0", "sin reportes: juan no ve consultas")
ok(not pu(juan, f"select public.resumen_consultas('{A}', 7)"), "sin reportes: tampoco el reporte")
ok(vu(juan, f"select count(*) from equipos where negocio_id = '{A}'") == "0", "sin equipos: juan no ve equipos")
ok(not pu(juan, f"select public.guardar_salida('{A}', null)"), "sin equipos: no toca la clave de salida")
ok(not pu(juan, f"select public.cambiar_permisos('{A}', '{U['carla']}', array['reportes'], null)"), "sin usuarios: no cambia permisos de nadie")

# permisos por sucursal
ana = U["ana"]
valor("ana", f"select public.cambiar_permisos('{A}', '{juan}', array['reportes', 'equipos', 'sucursales'], array['{nor}'::uuid])")
valor(False, f"insert into consultas (negocio_id, sucursal_id, codigo, encontrado) values ('{A}', '{nor}', 'N1', true), ('{A}', '{cen}', 'C1', true), ('{A}', '{cen}', 'C2', false)")
r = json.loads(vu(juan, f"select public.resumen_consultas('{A}', 7)"))
ok([x["sucursal"] for x in r["por_sucursal"]] == ["Norte"], "reportes solo en Norte: el reporte trae solo Norte")
ok(vu(juan, f"select count(*) from consultas where negocio_id = '{A}' and sucursal_id = '{cen}'") == "0", "…y no lee consultas de Centro")
ok(pu(juan, f"update sucursales set nombre = 'Norte 2' where id = '{nor}'") and valor("ana", f"select nombre from sucursales where id = '{nor}'") == "Norte 2", "sucursales en Norte: la edita")
vu(juan, f"update sucursales set nombre = 'Centro X' where id = '{cen}'")
ok(valor("ana", f"select nombre from sucursales where id = '{cen}'") == "Centro", "…pero no Centro")
ok(not pu(juan, f"insert into sucursales (negocio_id, codigo, nombre) values ('{A}', 'nueva', 'Nueva')"), "crear sucursales exige la casilla en todas")
CL = "7" * 64
cod = json.loads(valor(None, f"select public.solicitar_vinculo('{CL}')"))["codigo"]
ok(vu(juan, f"select coalesce(public.vincular_equipo('{cod}', '{cen}', 'x')::text, 'no')").startswith("ERROR"), "equipos en Norte: no vincula en Centro")
ok(len(vu(juan, f"select public.vincular_equipo('{cod}', '{nor}', 'Kiosco Norte')")) == 36, "…sí en Norte")
ok(vu(juan, f"select count(*) from equipos where negocio_id = '{A}'") == "1", "ve solo el equipo de Norte")
ok(not pu(juan, f"insert into inventarios (negocio_id, nombre) values ('{A}', 'Ya no')"), "le quitaron inventarios: ya no crea inventarios")

# apariencia
valor("ana", f"select public.cambiar_permisos('{A}', '{juan}', array['apariencia'], null)")
ok(pu(juan, f"update negocios set moneda = 'US$' where id = '{A}'") and valor("ana", f"select moneda from negocios where id = '{A}'") == "US$", "apariencia: cambia la moneda")
ok(pu(juan, f"insert into storage.objects (bucket_id, name) values ('marcas', '{A}/logo.png')"), "apariencia: sube el logo")
valor("ana", f"update negocios set moneda = 'RD$' where id = '{A}'")

# ---------------------------------------------------------------- quién administra a quién
luis = cuenta("luis")
valor("ana", f"select public.agregar_usuario('{A}', '{luis}', 'luis', 'Luis', array['usuarios', 'reportes', 'equipos'], null)")
ok(valor("ana", f"select rol from miembros where user_id = '{luis}'") == "verificador", "luis: usuarios + reportes + equipos (no es admin completo)")
maria = cuenta("maria")
ok(not pu(luis, f"select public.agregar_usuario('{A}', '{maria}', 'maria', 'María', array['usuarios'], null)"), "solo el dueño da la casilla «usuarios»")
ok(not pu(luis, f"select public.agregar_usuario('{A}', '{maria}', 'maria', 'María', array['inventarios'], null)"), "no da casillas que él no tiene")
ok(pu(luis, f"select public.agregar_usuario('{A}', '{maria}', 'maria', 'María', array['reportes'], array['{cen}'::uuid])"), "sí da las que tiene (reportes en Centro)")
ok(not pu(luis, f"select public.cambiar_permisos('{A}', '{ana}', array[]::text[], null)"), "nadie cambia al dueño")
ok(not pu(luis, f"select public.cambiar_permisos('{A}', '{luis}', array['usuarios','inventarios'], null)"), "nadie se cambia a sí mismo")
ok(not pu(luis, f"select public.cambiar_permisos('{A}', '{juan}', array[]::text[], null)"), "no toca a quien tiene casillas que él no tiene (juan: apariencia)")
ok(not pu(luis, f"select public.quitar_miembro('{A}', '{ana}')"), "no quita al dueño")
ok(valor("ana", f"select public.puede_administrar_usuario('{A}', '{maria}')") == "t", "el dueño puede cambiar la clave de maria")
ok(vu(luis, f"select public.puede_administrar_usuario('{A}', '{maria}')") == "t", "luis también (la creó con lo que él tiene)")
ok(vu(luis, f"select public.puede_administrar_usuario('{A}', '{juan}')") == "f", "luis no puede con juan")
ok(valor("ana", f"select public.puede_administrar_usuario('{A}', '{U['carla']}')") == "f", "nadie cambia la clave de una cuenta con correo real")
ok(valor("ana", f"select public.puede_administrar_usuario('{A}', '{ana}')") == "f", "ni la del dueño por aquí")
ok(valor("beto", f"select public.puede_administrar_usuario('{A}', '{maria}')") == "f", "otro negocio no puede")
ok(pu(luis, f"select public.invitar('{A}', 'enc@x.com', 'encargado', '{cen}')") is False, "luis no invita encargados (no tiene «sucursales»)")
valor("ana", f"select public.cambiar_permisos('{A}', '{luis}', array['usuarios', 'reportes', 'equipos', 'sucursales'], null)")
ok(pu(luis, f"select public.invitar('{A}', 'enc@x.com', 'encargado', '{cen}')"), "con esas casillas sí invita encargados")
ok(not pu(luis, f"select public.invitar('{A}', 'adm@x.com', 'admin')"), "pero no administradores")
ok(pu(luis, f"select public.quitar_miembro('{A}', '{maria}')") and valor("ana", f"select count(*) from miembros where user_id = '{maria}'") == "0", "luis quita a maria")
valor("ana", f"select public.cambiar_permisos('{A}', '{juan}', array['reportes','inventarios','sucursales','equipos','apariencia','usuarios'], null)")
ok(valor("ana", f"select rol from miembros where user_id = '{juan}'") == "admin", "con todas las casillas en todas las sucursales, la etiqueta es «admin»")
ok(valor("ana", "select public.administra('" + A + "')") == "t", "la regla vieja «administra» sigue valiendo para el dueño")
# Bajar a alguien de «admin» a empleado con algunas casillas: debe quedar con ESAS casillas (no sin nada).
valor("ana", f"select public.cambiar_permisos('{A}', '{juan}', array['reportes'], array['{cen}']::uuid[])")
ok(valor("ana", f"select rol || '|' || array_to_string(permisos, ',') || '|' || array_to_string(sucursales, ',') from miembros where user_id = '{juan}'")
   == f"verificador|reportes|{cen}", "de admin a empleado: conserva las casillas y sucursales nuevas")
# Un empleado (cuenta sin correo) no puede crear negocios propios con esa cuenta.
ok(not pu(juan, "select public.crear_negocio('Negocio de Juan')"), "una cuenta de empleado no crea negocios")

print(f"\n{c.bien} bien, {c.mal} mal")
