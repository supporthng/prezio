"""0024: cambiar el dueño de un negocio desde la Plataforma."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _comun import *   # noqa: F401,F403
import _comun as c

N = nuevo_negocio("eva", "Cambia Dueño")
ok(not N.startswith("ERROR"), "negocio de prueba")
duenos = lambda: valor(False, f"select string_agg(user_id::text, ',' order by user_id) from miembros where negocio_id = '{N}' and rol = 'dueno'")
ok(duenos() == U["eva"], "eva es la dueña")

ok(not puede("eva", f"select public.plataforma_cambiar_dueno('{N}', '{U['ana']}')"), "el propio dueño no usa esta vía")
ok(not puede(None, f"select public.plataforma_cambiar_dueno('{N}', '{U['ana']}')"), "anónimo tampoco")
valor(False, f"update plataforma_admins set rol = 'soporte' where user_id = '{U['pat']}'")
ok(not puede("pat", f"select public.plataforma_cambiar_dueno('{N}', '{U['ana']}')"), "rol soporte: no puede")
valor(False, f"update plataforma_admins set rol = 'ventas' where user_id = '{U['pat']}'")

# un dueño con usuario y clave (cuenta sin correo real) también en el negocio
jefe = valor(False, "select gen_random_uuid()")
valor(False, f"insert into auth.users (id, email, raw_user_meta_data) values ('{jefe}', public.correo_de_usuario('{N}', 'jefe'), '{{\"correo\":\"jefe@ejemplo.com\"}}')")
valor(False, f"insert into miembros (negocio_id, user_id, rol, usuario, permisos) values ('{N}', '{jefe}', 'dueno', 'jefe', public.permisos_de_rol('dueno'))")
ok(not puede("pat", f"select public.plataforma_cambiar_dueno('{N}', '{jefe}')"), "el nuevo dueño debe tener correo real")

r = json.loads(valor("pat", f"select public.plataforma_cambiar_dueno('{N}', '{U['ana']}', 'Ana Nueva')"))
ok(duenos() == U["ana"], "ahora la única dueña es ana")
ok(valor(False, f"select count(*) from miembros where negocio_id = '{N}' and user_id in ('{U['eva']}', '{jefe}')") == "0", "los dueños anteriores salieron del negocio")
ok(r["cuentas"] == [jefe], "la cuenta «usuario» que queda sin negocio se devuelve para borrarla")
ok(set(r["antes"]) >= {"jefe"} and r["ahora"], "devuelve quién salió y quién entró")
ok(valor(False, f"select count(*) from auth.users where id = '{U['eva']}'") == "1", "la cuenta con correo de eva se conserva")
ok(valor(False, f"select count(*) from licencia_eventos where negocio_id = '{N}' and tipo = 'dueno_cambiado'") == "1", "queda en el historial")
ok(puede("ana", f"select 1 from negocios where id = '{N}'") and valor("ana", f"select count(*) from negocios where id = '{N}'") == "1", "la nueva dueña ve su negocio")
ok(valor("eva", f"select count(*) from negocios where id = '{N}'") == "0", "eva ya no lo ve")
# cambiar al mismo dueño no rompe nada
json.loads(valor("pat", f"select public.plataforma_cambiar_dueno('{N}', '{U['ana']}')"))
ok(duenos() == U["ana"], "repetir con la misma dueña: sigue igual")

# dueño con usuario: buscar su cuenta para cambiar el correo de contacto
valor(False, f"insert into miembros (negocio_id, user_id, rol, usuario, permisos) values ('{N}', '{jefe}', 'dueno', 'jefe', public.permisos_de_rol('dueno'))")
ok(valor("pat", f"select public.plataforma_dueno_usuario('{N}', ' JEFE ')") == jefe, "encuentra al dueño con usuario «jefe»")
ok(valor("pat", f"select public.plataforma_dueno_usuario('{N}', 'nadie')") == "", "un usuario que no es dueño: nada")
ok(not puede("ana", f"select public.plataforma_dueno_usuario('{N}', 'jefe')"), "un negocio no puede usarla")

valor(False, f"update plataforma_admins set rol = 'administrador' where user_id = '{U['pat']}'")
print(f"\n{c.bien} bien, {c.mal} mal")
sys.exit(1 if c.mal else 0)
