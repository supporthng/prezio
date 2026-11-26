"""0022: ingresos de la Plataforma. Correr después de licencias/planes (usa sus pagos)."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _comun import *   # noqa: F401,F403
import _comun as c

ok(not puede("ana", "select public.plataforma_ingresos()"), "un negocio no ve los ingresos")
ok(not puede(None, "select public.plataforma_ingresos()"), "anónimo tampoco")
r = json.loads(valor("pat", "select public.plataforma_ingresos()"))
total = float(valor(False, "select coalesce(sum(monto),0) from licencia_pagos where creado >= date_trunc('month', now() at time zone 'America/Santo_Domingo') at time zone 'America/Santo_Domingo'"))
ok(abs(float(r["cobrado"]) - total) < .01 and r["pagos"] >= 1, f"cobrado del mes = suma de pagos del mes ({r['cobrado']})")
ok(len(r["ultimos"]) >= 1 and "nombre" in r["ultimos"][0] and "monto" in r["ultimos"][0], "últimos pagos con negocio y monto")
ok(all(k in r for k in ("por_cobrar", "atrasados", "recurrente", "pruebas_terminan", "clientes_pagando", "cobrado_antes")), "trae todas las cifras")
# un pago de hoy suma al mes
N = nuevo_negocio("eva", "Paga Hoy")
antes = float(r["cobrado"])
valor("pat", f"select public.plataforma_registrar_pago('{N}', 'basico', 1)")
r2 = json.loads(valor("pat", "select public.plataforma_ingresos()"))
monto = float(valor(False, f"select monto from licencia_pagos where negocio_id = '{N}'") or 0)
ok(abs(float(r2["cobrado"]) - (antes + monto)) < .01 and r2["pagos"] == r["pagos"] + 1, "un pago nuevo suma al cobrado del mes")
ok(r2["ultimos"][0]["nombre"] == "Paga Hoy", "y aparece primero en los últimos pagos")
ok(float(r2["recurrente"]) >= float(r["recurrente"]), "el ingreso recurrente no baja con un pago nuevo")
valor(False, f"update plataforma_admins set rol = 'soporte' where user_id = '{U['pat']}'")
ok(not puede("pat", "select public.plataforma_ingresos()"), "rol soporte: no ve ingresos")
valor(False, f"update plataforma_admins set rol = 'administrador' where user_id = '{U['pat']}'")
print(f"\n{c.bien} bien, {c.mal} mal")
sys.exit(1 if c.mal else 0)
