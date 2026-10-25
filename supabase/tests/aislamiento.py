import subprocess, json
U = {"ana": "00000000-0000-0000-0000-00000000000a", "beto": "00000000-0000-0000-0000-00000000000b",
     "carla": "00000000-0000-0000-0000-00000000000c", "dani": "00000000-0000-0000-0000-00000000000d",
     "eva": "00000000-0000-0000-0000-00000000000e"}
MAIL = {"ana": "ana@a.com", "beto": "beto@b.com", "carla": "carla@a.com", "dani": "dani@a.com", "eva": "eva@x.com"}
bien = mal = 0
def sql(quien, consulta):
    pre = ""
    if quien:
        pre = (f"set role authenticated; select set_config('request.jwt.claim.sub', '{U[quien]}', false), "
               f"set_config('request.jwt.claims', '{json.dumps({'sub': U[quien], 'email': MAIL[quien]})}', false) \\g /dev/null\n")
    elif quien is None:
        pre = "set role anon;\n"
    p = subprocess.run(["su", "postgres", "-c", "psql -h /var/lib/postgresql -p 5499 -d prezio -At -q -v ON_ERROR_STOP=1"],
                       input=pre + consulta, capture_output=True, text=True)
    return p.returncode == 0, (p.stdout.strip() if p.returncode == 0 else p.stderr.strip().splitlines()[-1] if p.stderr.strip() else "")
def ok(c, m):
    global bien, mal
    bien += c; mal += not c
    print(("✅ " if c else "❌ ") + m)
def puede(quien, q): return sql(quien, q)[0]
def valor(quien, q):
    r, v = sql(quien, q); return v if r else "ERROR: " + v

A = valor("ana", "select public.crear_negocio('Supermercado Abarrotao');")
B = valor("beto", "select public.crear_negocio('Farmacia Beto');")
ok(len(A) == 36 and len(B) == 36, f"dos negocios creados ({A[:8]}…, {B[:8]}…)")
ok(valor("ana", f"select slug || '|' || plan from negocios where id = '{A}'") == "supermercado-abarrotao|prueba", "slug y plan de prueba")
ok(valor("ana", f"select nombre from sucursales where negocio_id = '{A}' and es_principal") == "Principal", "se crea la Principal")
ok(valor("ana", f"select rol from miembros where negocio_id = '{A}'") == "dueno", "quien crea es dueño")
# Aislamiento
ok(valor("ana", "select count(*) from negocios") == "1", "Ana solo ve su negocio")
ok(valor("beto", f"select count(*) from sucursales where negocio_id = '{A}'") == "0", "Beto no ve las sucursales de Ana")
ok(not puede("beto", f"insert into inventarios (negocio_id, nombre) values ('{A}', 'intruso');"), "Beto no puede crear inventarios en el negocio de Ana")
inv = valor("ana", f"insert into inventarios (negocio_id, nombre) values ('{A}', 'General') returning id;")
ok(len(inv) == 36, "Ana crea un inventario")
n = valor("ana", f"""select public.reemplazar_productos('{inv}', '[{{"codigo":"111","nombre":"Arroz","precio":50}},{{"codigo":"222","nombre":"Leche","precio":75.5}},{{"codigo":"111","nombre":"dup","precio":1}},{{"codigo":"","nombre":"x","precio":1}}]');""")
ok(n == "2", f"reemplazar productos: 2 válidos, sin duplicados ni vacíos ({n})")
ok(valor("beto", f"select count(*) from productos where inventario_id = '{inv}'") == "0", "Beto no ve los productos de Ana")
ok(not puede("beto", f"select public.reemplazar_productos('{inv}', '[]');"), "Beto no puede vaciar el inventario de Ana")
invB = valor("beto", f"insert into inventarios (negocio_id, nombre) values ('{B}', 'General') returning id;")
ok(not puede("beto", f"insert into productos (inventario_id, negocio_id, codigo, nombre, precio) values ('{inv}', '{B}', '9', 'x', 1);"), "no se puede meter un producto en un inventario ajeno con el negocio propio")
ok(not puede("ana", f"update negocios set plan = 'profesional' where id = '{A}';"), "el cliente no puede cambiarse el plan")
ok(puede("ana", f"update negocios set nombre = 'Abarrotao SRL' where id = '{A}';"), "el dueño cambia el nombre del negocio")
ok(valor("beto", f"update negocios set nombre = 'hackeado' where id = '{A}' returning id;") == "", "Beto no puede renombrar el negocio de Ana")
ok(valor(None, "select count(*) from negocios") .startswith("ERROR"), "anónimo no lee nada")
ok(not puede("ana", f"delete from sucursales where negocio_id = '{A}' and es_principal;") or valor("ana", f"select count(*) from sucursales where negocio_id = '{A}' and es_principal") == "1", "la Principal no se borra")
ok(not puede("ana", f"insert into sucursales (negocio_id, codigo, nombre, es_principal) values ('{A}', 'otra', 'Otra', true);"), "no se crea una segunda Principal")
suc = valor("ana", f"insert into sucursales (negocio_id, codigo, nombre) values ('{A}', 'centro', 'Centro') returning id;")
# Invitaciones y roles
tok_c = valor("ana", f"select public.invitar('{A}', 'Carla@a.com', 'encargado', '{suc}');")
tok_d = valor("ana", f"select public.invitar('{A}', 'dani@a.com', 'admin');")
ok(len(tok_c) == 36 and len(tok_d) == 36, "el dueño invita a una encargada y a un admin")
ok(not puede("beto", f"select public.invitar('{A}', 'beto2@b.com', 'admin');"), "Beto no puede invitar en el negocio de Ana")
ok(not puede("eva", f"select public.aceptar_invitacion('{tok_c}');"), "otra cuenta no puede usar la invitación de Carla")
ok(valor("carla", f"select public.aceptar_invitacion('{tok_c}');") == A, "Carla acepta y entra al negocio")
ok(not puede("carla", f"select public.aceptar_invitacion('{tok_c}');"), "la invitación no se usa dos veces")
ok(valor("dani", f"select public.aceptar_invitacion('{tok_d}');") == A, "Dani entra como admin")
ok(not puede("dani", f"select public.invitar('{A}', 'otro@a.com', 'admin');"), "un admin no puede invitar administradores")
ok(puede("dani", f"select public.invitar('{A}', 'otro@a.com', 'verificador');"), "un admin invita verificadores")
ok(not puede("carla", f"insert into inventarios (negocio_id, nombre) values ('{A}', 'carla');"), "la encargada no carga inventarios")
ok(valor("carla", f"select count(*) from productos where negocio_id = '{A}'") == "2", "la encargada ve los productos (para consultar)")
fuente = json.dumps({"tipo": "inventario", "inventario_id": inv})
ok(valor("carla", f"update sucursales set fuente = '{fuente}' where id = '{suc}' returning id;") == suc, "la encargada elige la fuente de SU sucursal")
principal = valor("ana", f"select id from sucursales where negocio_id = '{A}' and es_principal")
ok(valor("carla", f"update sucursales set nombre = 'x' where id = '{principal}' returning id;") == "", "la encargada no cambia otra sucursal")
ok(not puede("carla", f"update sucursales set es_principal = true where id = '{suc}';"), "nadie cambia qué sucursal es la Principal")
ok(not puede("carla", f"select public.quitar_miembro('{A}', '{U['dani']}');"), "la encargada no quita miembros")
ok(not puede("dani", f"select public.quitar_miembro('{A}', '{U['ana']}');"), "nadie quita al dueño")
# Consultas
ok(puede("carla", f"insert into consultas (negocio_id, sucursal_id, codigo, encontrado) values ('{A}', '{suc}', '111', true);"), "la encargada registra consultas")
ok(puede("ana", f"insert into consultas (negocio_id, sucursal_id, codigo, encontrado) values ('{A}', '{principal}', '222', true);"), "consulta en la Principal")
ok(valor("carla", f"select count(*) from consultas") == "1", "la encargada ve solo las consultas de su sucursal")
ok(valor("ana", f"select count(*) from consultas") == "2", "el dueño ve todas")
ok(not puede("beto", f"insert into consultas (negocio_id, codigo, encontrado) values ('{A}', '1', true);"), "Beto no registra consultas en el negocio de Ana")
ok(valor("beto", "select count(*) from miembros") == "1", "Beto solo ve los miembros de su negocio")
ok(valor("beto", "select count(*) from invitaciones") == "0", "Beto no ve las invitaciones de Ana")
ok(valor("carla", "select count(*) from invitaciones") == "0", "la encargada no ve invitaciones")
ok(puede("ana", f"select public.quitar_miembro('{A}', '{U['carla']}');") and valor("carla", "select count(*) from negocios") == "0", "al quitar a Carla deja de ver el negocio")
for i in range(4): valor("eva", f"select public.crear_negocio('Negocio {i}');")
ok(valor("eva", "select public.crear_negocio('Quinto');") != "" and not puede("eva", "select public.crear_negocio('Sexto');"), "máximo 5 negocios por cuenta")
ok(valor("ana", "select public.crear_negocio('Ñandú Ácido');").startswith("ERROR") is False and valor("ana", "select slug from negocios where nombre = 'Ñandú Ácido'") == "nandu-acido", "slug sin acentos")
print(f"{bien} bien, {mal} mal")
# Perfiles
ok(valor("ana", "select count(*) from perfiles") == "2", "Ana ve su perfil y el de Dani (comparten negocio), no los demás")
ok(valor("beto", "select correo from perfiles") == "beto@b.com", "Beto solo ve su propio perfil")
ok(puede("ana", "update perfiles set nombre = 'Ana Pérez' where id = auth.uid();") and valor("ana", "select nombre from perfiles where id = auth.uid()") == "Ana Pérez", "cada uno cambia su nombre")
ok(valor("ana", f"update perfiles set nombre = 'x' where id = '{U['dani']}' returning id;") == "", "no se cambia el nombre de otro")
ok(not puede("ana", "update perfiles set correo = 'x@x.com' where id = auth.uid();"), "el correo no se cambia desde la app")
print(f"{bien} bien, {mal} mal")
