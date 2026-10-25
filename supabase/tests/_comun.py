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
    if p.returncode == 0:
        return True, p.stdout.strip()
    lineas = p.stderr.strip().splitlines()
    errores = [l for l in lineas if "ERROR:" in l]
    return False, (errores[-1] if errores else lineas[-1] if lineas else "")
def ok(c, m):
    global bien, mal
    c = bool(c)
    bien += c; mal += not c
    print(("✅ " if c else "❌ ") + m)
def puede(quien, q): return sql(quien, q)[0]
def valor(quien, q):
    r, v = sql(quien, q); return v if r else "ERROR: " + v

