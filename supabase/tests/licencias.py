"""0011: licencia PREZIO-XXXX-XXXX-XXXX, prueba de 30 días, vencimiento y pagos. Correr después de los demás."""
import json, os, re, sys, uuid
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _comun import *   # noqa: F401,F403
import _comun as c

FORMATO = re.compile(r"^PREZIO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$")
A = valor("ana", "select id from negocios where nombre = 'Tienda Precios'")
lic = valor("ana", f"select licencia from negocios where id = '{A}'")
ok(FORMATO.match(lic) is not None, f"los negocios que ya existían reciben su licencia ({lic})")
ok(not re.search(r"[01OIL]", lic[7:]), "sin caracteres que se confunden (0/O, 1/I/L)")
ok(valor(False, "select count(*) = count(distinct licencia) from negocios") == "t", "cada licencia es única")
r = json.loads(valor("pat", "select public.plataforma_crear_negocio('Licencias SRL', 'licencias-srl')"))
N = r["id"]
L = valor("pat", f"select public.plataforma_licencia_de('{N}')")
ok(FORMATO.match(L) is not None, f"un alta nueva nace con su licencia ({L})")
ok(not puede(False, f"update negocios set licencia = 'PREZIO-MAL' where id = '{N}'"), "la licencia siempre tiene el formato PREZIO-XXXX-XXXX-XXXX")

# ---------------------------------------------------------------- entrar con la licencia
ok(valor(None, f"select public.negocio_de_slug('{L}')") == N, "sin sesión, la licencia lleva al negocio (para entrar)")
ok(valor(None, f"select public.negocio_de_slug('  {L.lower()} ')") == N, "sin importar mayúsculas ni espacios")
ok(valor(None, "select public.negocio_de_slug('licencias-srl')") == N, "el código viejo de la dirección también sirve")
ok(valor(None, "select coalesce(public.negocio_de_slug('PREZIO-AAAA-BBBB-CCCC')::text, 'nada')") == "nada", "una licencia inventada: nada")

# ---------------------------------------------------------------- prueba de 30 días
due = str(uuid.uuid4())
valor(False, f"insert into auth.users (id, email) values ('{due}', public.correo_de_usuario('{N}', 'jefe'))")
valor("pat", f"select public.plataforma_poner_dueno('{N}', '{due}', 'jefe')")
def como_jefe(q):
    return c.sql(None, f"set role authenticated; select set_config('request.jwt.claim.sub', '{due}', false) \\g /dev/null\n{q}")
est = json.loads(como_jefe(f"select public.negocio_licencia('{N}')")[1])
ok(est["estado"] == "prueba" and est["dias"] in (30, 31) and est["licencia"] == L, f"nace en prueba con 30 días ({est['dias']})")
ok(como_jefe(f"select public.puede('{N}', 'inventarios')")[1] == "t", "en prueba: puede trabajar")
ok(not puede("beto", f"select public.negocio_licencia('{N}')"), "otro negocio no ve esta licencia")
valor(False, f"update negocios set prueba_hasta = now() - interval '1 minute' where id = '{N}'")
est = json.loads(como_jefe(f"select public.negocio_licencia('{N}')")[1])
ok(est["estado"] == "vencida", "pasados los 30 días: vencida")
ok(como_jefe(f"select public.puede('{N}', 'inventarios')")[1] == "f", "vencida: el panel queda de solo lectura (exige el pago)")
ok(valor(False, f"select public.negocio_suspendido('{N}')") == "t", "vencida: verificadores, celular y conector se detienen (igual que suspendido)")

# ---------------------------------------------------------------- pagar
ok(not puede("ana", f"select public.plataforma_registrar_pago('{N}', 'basico', 1)"), "un dueño no se registra pagos")
ok(not puede("pat", f"select public.plataforma_registrar_pago('{N}', 'gratis', 1)"), "plan no válido: rechazado")
p = json.loads(valor("pat", f"select public.plataforma_registrar_pago('{N}', 'basico', 1, 'Transferencia 0042')"))
ok(p["plan"] == "basico", "la plataforma registra el pago de un mes")
est = json.loads(como_jefe(f"select public.negocio_licencia('{N}')")[1])
ok(est["estado"] == "activa" and 27 <= est["dias"] <= 32, f"pagada: activa por un mes ({est['dias']} días)")
ok(como_jefe(f"select public.puede('{N}', 'inventarios')")[1] == "t", "pagada: vuelve a funcionar todo")
p2 = json.loads(valor("pat", f"select public.plataforma_registrar_pago('{N}', 'profesional', 12)"))
est = json.loads(como_jefe(f"select public.negocio_licencia('{N}')")[1])
ok(est["dias"] >= 390, f"pagar antes de vencer suma desde la fecha pagada, no desde hoy ({est['dias']} días)")
pagos = json.loads(valor("pat", f"select public.plataforma_pagos('{N}')"))
ok(len(pagos) == 2 and pagos[1]["nota"] == "Transferencia 0042", "queda el historial de pagos con su nota")
valor(False, f"update negocios set pagado_hasta = now() - interval '1 day' where id = '{N}'")
ok(json.loads(como_jefe(f"select public.negocio_licencia('{N}')")[1])["estado"] == "vencida", "pago vencido: vuelve a exigir el pago")

# ---------------------------------------------------------------- extender la prueba
ok(not puede("pat", f"select public.plataforma_extender_prueba('{N}', 200)"), "extender: máximo 90 días")
valor("pat", f"select public.plataforma_extender_prueba('{N}', 15)")
est = json.loads(como_jefe(f"select public.negocio_licencia('{N}')")[1])
ok(est["estado"] == "prueba" and est["dias"] in (15, 16), "la plataforma puede dar días de prueba extra")
valor("pat", f"select public.plataforma_cambiar_plan('{N}', 'suspendido')")
ok(json.loads(como_jefe(f"select public.negocio_licencia('{N}')")[1])["estado"] == "suspendida", "suspendida a mano: lo dice")
fila = next(x for x in json.loads(valor("pat", "select public.plataforma_negocios()")) if x["id"] == N)
ok(fila["licencia"] == L and fila["bloqueado"] is True, "la Plataforma ve la licencia y si está bloqueado")
print(f"{c.bien} bien, {c.mal} mal")
