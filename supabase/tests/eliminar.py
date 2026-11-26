"""0021: eliminar un negocio desde la Plataforma."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _comun import *   # noqa: F401,F403
import _comun as c

N = nuevo_negocio("eva", "Para Borrar")
ok(not N.startswith("ERROR"), f"negocio de prueba creado {N[:40]}")
valor(False, f"insert into sucursales (negocio_id, nombre, codigo) values ('{N}', 'Segunda', 'segunda')")
inv = valor("eva", f"insert into inventarios (negocio_id, nombre) values ('{N}', 'Lista') returning id")
valor("eva", f"select public.reemplazar_productos('{inv}', '[{{\"codigo\":\"1\",\"nombre\":\"Uno\",\"precio\":1}}]')")
ok(valor(False, f"select count(*) from productos where negocio_id = '{N}'") == "1", "tiene productos")

# solo un administrador de la plataforma
ok(not puede("eva", f"select public.plataforma_eliminar_negocio('{N}', 'Para Borrar')"), "el dueño no puede eliminar su negocio por esta vía")
ok(not puede("ana", f"select public.plataforma_eliminar_negocio('{N}', 'Para Borrar')"), "otro usuario tampoco")
ok(not puede(None, f"select public.plataforma_eliminar_negocio('{N}', 'Para Borrar')"), "anónimo tampoco")
valor(False, f"update plataforma_admins set rol = 'ventas' where user_id = '{U['pat']}'")
ok(not puede("pat", f"select public.plataforma_eliminar_negocio('{N}', 'Para Borrar')"), "rol ventas: no puede")
valor(False, f"update plataforma_admins set rol = 'administrador' where user_id = '{U['pat']}'")

# confirmación con el nombre
ok(not puede("pat", f"select public.plataforma_eliminar_negocio('{N}', 'otro nombre')"), "nombre equivocado: no borra")
ok(valor(False, f"select count(*) from negocios where id = '{N}'") == "1", "sigue ahí")

r = json.loads(valor("pat", f"select public.plataforma_eliminar_negocio('{N}', '  para borrar ')"))
ok(r["id"] == N and r["slug"], "con el nombre (sin importar mayúsculas ni espacios): eliminado")
ok(valor(False, f"select count(*) from negocios where id = '{N}'") == "0", "el negocio ya no existe")
ok(valor(False, f"select (select count(*) from sucursales where negocio_id = '{N}') + (select count(*) from productos where negocio_id = '{N}') + (select count(*) from miembros where negocio_id = '{N}')") == "0",
   "sus sucursales, productos y miembros se borran")
ok(valor(False, f"select count(*) from auth.users where id = '{U['eva']}'") == "1", "la cuenta con correo del dueño se conserva")
b = json.loads(valor(False, f"select row_to_json(b) from plataforma_bajas b where negocio_id = '{N}'"))
ok(b["nombre"] == "Para Borrar" and b["por"] == U["pat"] and b["detalle"]["productos"] == 1, "queda constancia de la baja")
ok(valor("pat", "select count(*) from plataforma_bajas") >= "1", "el administrador ve las bajas")
ok(valor("eva", "select count(*) from plataforma_bajas") == "0", "un negocio no ve las bajas")
ok(not puede("pat", f"insert into plataforma_bajas (negocio_id, nombre, slug) values (gen_random_uuid(), 'x', 'x')"), "nadie escribe bajas a mano")
ok(not puede("pat", f"select public.plataforma_eliminar_negocio('{N}', 'Para Borrar')"), "eliminar dos veces: error claro")

print(f"\n{c.bien} bien, {c.mal} mal")
sys.exit(1 if c.mal else 0)
