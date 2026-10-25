"""0012: niveles de acceso. Correr después de los demás (usa sus datos)."""
import json, os, sys, uuid
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _comun import *   # noqa: F401,F403
import _comun as c

A = valor("ana", "select id from negocios where nombre = 'Tienda Precios'")
cen = valor("ana", f"select id from sucursales where negocio_id = '{A}' and codigo = 'centro'")
nombres = valor("ana", f"select string_agg(nombre, ',' order by orden) from niveles where negocio_id = '{A}'")
ok(nombres == "Administrador,Gerente de sucursal,Encargado de precios,Técnico de equipos,Supervisor,Cajero", f"los negocios que ya existían tienen los niveles básicos ({nombres})")
N = json.loads(valor("pat", "select public.plataforma_crear_negocio('Niveles SA')"))["id"]
ok(valor(False, f"select count(*) from niveles where negocio_id = '{N}'") == "6", "un negocio nuevo nace con sus 6 niveles")
ok(valor("beto", f"select count(*) from niveles where negocio_id = '{A}'") == "0", "otro negocio no ve los niveles de este")
nid = lambda n: valor("ana", f"select id from niveles where negocio_id = '{A}' and nombre = '{n}'")

# un empleado sin correo
cuenta = str(uuid.uuid4())
valor(False, f"insert into auth.users (id, email) values ('{cuenta}', public.correo_de_usuario('{A}', 'pedro_n'))")
ok(puede("ana", f"select public.agregar_usuario('{A}', '{cuenta}', 'pedro_n', 'Pedro', array[]::text[], array['{cen}']::uuid[])"), "se crea el usuario")
ok(puede("ana", f"select public.cambiar_acceso('{A}', '{cuenta}', '{nid('Gerente de sucursal')}', null, array['{cen}']::uuid[])"), "se le da el nivel «Gerente de sucursal» en Centro")
fila = valor(False, f"select array_to_string(permisos, ',') || '|' || array_to_string(sucursales, ',') || '|' || (nivel_id is not null) from miembros where user_id = '{cuenta}'")
ok(fila == f"equipos,inventarios,reportes,sucursales|{cen}|true", f"sus casillas salen del nivel, en su sucursal ({fila})")

# cambiar el nivel cambia a la persona
ok(puede("ana", f"select public.guardar_nivel('{A}', '{nid('Gerente de sucursal')}', 'Gerente de sucursal', 'Sin equipos', array['reportes','inventarios','sucursales'], true)"), "el dueño cambia las casillas del nivel")
ok(valor(False, f"select array_to_string(permisos, ',') from miembros where user_id = '{cuenta}'") == "inventarios,reportes,sucursales", "la persona con ese nivel toma las casillas nuevas")

# niveles propios
nuevo = valor("ana", f"select public.guardar_nivel('{A}', null, 'Auditor', 'Revisa precios y reportes', array['reportes','inventarios'], false)")
ok(len(nuevo) == 36, "el dueño crea un nivel propio («Auditor»)")
ok(not puede("ana", f"select public.guardar_nivel('{A}', null, 'auditor', '', array['reportes'], false)"), "no repite el nombre de un nivel")
ok(not puede("beto", f"select public.guardar_nivel('{A}', null, 'Intruso', '', array['reportes'], false)"), "otro negocio no crea niveles aquí")

# un empleado con «Usuarios» (sin ser dueño) no crea niveles con más de lo que tiene, ni con «Usuarios»
jefa = str(uuid.uuid4())
valor(False, f"insert into auth.users (id, email) values ('{jefa}', public.correo_de_usuario('{A}', 'jefa_n'))")
valor("ana", f"select public.agregar_usuario('{A}', '{jefa}', 'jefa_n', 'Jefa', array['usuarios','reportes'], null)")
def como_jefa(q):
    return c.sql(None, f"set role authenticated; select set_config('request.jwt.claim.sub', '{jefa}', false) \\g /dev/null\n{q}")
ok(como_jefa(f"select public.guardar_nivel('{A}', null, 'Mirón', '', array['reportes'], false)")[0], "quien tiene «Usuarios» crea niveles con lo que él tiene")
ok(not como_jefa(f"select public.guardar_nivel('{A}', null, 'Más', '', array['inventarios'], false)")[0], "pero no con casillas que no tiene")
ok(not como_jefa(f"select public.guardar_nivel('{A}', '{nid('Administrador')}', 'Administrador', '', array['reportes'], false)")[0], "ni cambia el nivel Administrador")
ok(not como_jefa(f"select public.cambiar_acceso('{A}', '{cuenta}', '{nid('Administrador')}', null, null)")[0], "ni da el nivel Administrador")

# a mano (personalizado)
ok(puede("ana", f"select public.cambiar_acceso('{A}', '{cuenta}', null, array['reportes'], null)"), "también se puede dar casillas a mano")
ok(valor(False, f"select coalesce(nivel_id::text, 'personalizado') || '|' || array_to_string(permisos, ',') from miembros where user_id = '{cuenta}'") == "personalizado|reportes", "y queda «Personalizado»")

# borrar un nivel: quienes lo tenían conservan sus casillas
valor("ana", f"select public.cambiar_acceso('{A}', '{cuenta}', '{nuevo}', null, null)")
ok(puede("ana", f"select public.borrar_nivel('{nuevo}')"), "el dueño borra un nivel")
ok(valor(False, f"select coalesce(nivel_id::text, 'personalizado') || '|' || array_to_string(permisos, ',') from miembros where user_id = '{cuenta}'") == "personalizado|inventarios,reportes",
   "quien lo tenía conserva sus casillas")
ok(not puede("beto", f"select public.borrar_nivel('{nid('Cajero')}')"), "otro negocio no borra niveles aquí")
print(f"{c.bien} bien, {c.mal} mal")
