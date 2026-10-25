"""Prezio Administrador para Windows.

Un solo programa con dos partes:
  · Panel: el panel de Prezio en su propia ventana (inventarios, sucursales, equipos, usuarios…).
  · Conector de SQL Server: configurar con ventanas de dónde salen los precios (servidor, base, tabla y columnas
    por inventario), probar, enviar ahora y dejarlo trabajando solo al encender la PC.

El envío automático lo hace este mismo programa en segundo plano:
  PrezioAdministrador.exe --servicio      (lo arranca la tarea de Windows «Prezio Conector» como SYSTEM)
  PrezioAdministrador.exe --instalar      (crea esa tarea; pide permiso de administrador)
  PrezioAdministrador.exe --desinstalar   (la quita)

Usa la misma configuración y las mismas reglas que conector/prezio_conector.py (que se incluye al compilar).
"""
import json
import os
import platform
import re
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from contextlib import closing
from pathlib import Path

AQUI = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
sys.path.insert(0, str(AQUI))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "conector"))
import prezio_conector as pc  # noqa: E402

# La compilación (GitHub Actions) reemplaza estos dos valores.
SITIO = "https://prezio-jade.vercel.app"
VERSION = "1.0.0"
TAREA = pc.TAREA


# ---------------------------------------------------------------- catálogo de SQL Server (bases, tablas, columnas)
class CatalogoSqlServer:
    """Consultas de solo lectura para mostrar qué hay en el servidor."""

    def __init__(self, conectar=pc.conectar_sql):
        self.conectar = conectar

    def _filas(self, sql, consulta, base=None, *parametros):
        with closing(self.conectar(sql, base)) as cx:
            cur = cx.cursor()
            cur.execute(consulta, *parametros)
            return cur.fetchall()

    def bases(self, sql):
        filas = self._filas(sql, "SELECT name FROM sys.databases WHERE state_desc = 'ONLINE' AND HAS_DBACCESS(name) = 1 "
                                 "AND database_id > 4 ORDER BY name", "master")
        return [str(f[0]) for f in filas]

    def tablas(self, sql):
        filas = self._filas(sql, "SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES "
                                 "ORDER BY TABLE_SCHEMA, TABLE_NAME")
        return [{"nombre": f"{f[0]}.{f[1]}", "vista": str(f[2]).upper() == "VIEW"} for f in filas]

    def columnas(self, sql, tabla):
        esquema, _, nombre = tabla.rpartition(".")
        filas = self._filas(sql, "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS "
                                 "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION", None, esquema or "dbo", nombre)
        return [{"nombre": str(f[0]), "tipo": str(f[1])} for f in filas]

    def muestra(self, sql, mapeo):
        consulta = pc.consulta_de(mapeo)
        filas = self._filas(sql, f"SELECT TOP 8 * FROM ({consulta}) AS t")
        total = self._filas(sql, f"SELECT COUNT(*) FROM ({consulta}) AS t")[0][0]
        return filas, int(total)


SUGERENCIAS = {
    "codigo": ["codigobarra", "codigobarras", "codbarra", "codbarras", "barcode", "upc", "ean", "codigo", "cod"],
    "nombre": ["descripcion", "nombre", "producto", "articulo", "detalle", "desc"],
    "precio": ["precioventa", "preciodeventa", "precio1", "precio", "pvp", "venta"],
}


def sugerir(columnas, campo):
    norm = [(c, re.sub(r"[^a-z0-9]", "", c.lower())) for c in columnas]
    for clave in SUGERENCIAS[campo]:
        for original, n in norm:
            if n == clave:
                return original
    for clave in SUGERENCIAS[campo]:
        for original, n in norm:
            if n.startswith(clave):
                return original
    return ""


def mensaje(e):
    """Primera línea del error, sin el ruido técnico del controlador ODBC."""
    texto = str(e).strip() or type(e).__name__
    texto = re.sub(r"\[[^\]]*\]", "", texto.splitlines()[0]).strip(" :;(),'\"")
    if re.search(r"Login failed|18456", texto, re.I):
        return "SQL Server rechazó el usuario o la clave."
    if re.search(r"server was not found|not accessible|08001|timeout", texto, re.I):
        return "No se encontró el servidor. Revisa el nombre (ej.: localhost\\SQLEXPRESS) y que esté encendido."
    return texto[:300]


# ---------------------------------------------------------------- lo que la ventana le pide al programa
class Api:
    """Métodos que la ventana llama (window.pywebview.api.*). Cada uno devuelve {"ok": true, …} o {"error": "…"}."""

    def __init__(self, catalogo=None, conectar=pc.conectar_sql, ruta_config=pc.CONFIG):
        self.catalogo = catalogo or CatalogoSqlServer(conectar)
        self.conectar = conectar
        self.ruta = Path(ruta_config)
        self._ocupado = threading.Lock()

    # ---- configuración guardada
    def _cfg(self):
        return pc.leer_json(self.ruta, None) or {"sitio": SITIO, "cada_min": 10, "inventarios": {}}

    def _guardar(self, cfg):
        pc.guardar_json(self.ruta, cfg)

    def _sql(self, datos, cfg):
        """Datos de SQL Server de la ventana + la clave guardada si no escribieron otra."""
        previo = cfg.get("sql") or {}
        sql = {
            "servidor": str(datos.get("servidor") or "").strip(),
            "modo": "sql" if datos.get("modo") == "sql" else "windows",
            "usuario": str(datos.get("usuario") or "").strip(),
            "base": str(datos.get("base") or previo.get("base") or "").strip() or None,
            "controlador": previo.get("controlador") or self._controlador(),
            "confiar_certificado": True,
        }
        clave = str(datos.get("clave") or "")
        sql["clave"] = pc.proteger(clave) if clave else previo.get("clave", "")
        return sql

    @staticmethod
    def _controlador():
        try:
            import pyodbc
            return next((c for c in pc.CONTROLADORES if c in pyodbc.drivers()), "SQL Server")
        except Exception:
            return "SQL Server"

    def estado(self):
        cfg = self._cfg()
        sql = cfg.get("sql") or {}
        return {"ok": True, "version": VERSION, "equipo": platform.node(), "sitio": cfg.get("sitio") or SITIO,
                "hayClave": bool(cfg.get("clave")), "cada_min": cfg.get("cada_min", 10),
                "sql": {"servidor": sql.get("servidor", ""), "modo": sql.get("modo", "windows"), "usuario": sql.get("usuario", ""),
                        "base": sql.get("base") or "", "hayClave": bool(sql.get("clave"))},
                "inventarios": cfg.get("inventarios") or {}, "inicio": self._tarea_instalada(),
                "envios": pc.leer_json(pc.ESTADO, {}), "registro": self.registro()["lineas"]}

    # ---- paso 1: Prezio
    def probar_prezio(self, sitio, clave):
        cfg = self._cfg()
        sitio = str(sitio or SITIO).strip().rstrip("/")
        if not re.match(r"^https://[\w.-]+(:\d+)?$", sitio) and not sitio.startswith("http://localhost"):
            return {"error": "La dirección de Prezio debe empezar con https://"}
        prueba = {**cfg, "sitio": sitio, "clave": pc.proteger(str(clave).strip()) if clave else cfg.get("clave", "")}
        if not prueba["clave"]:
            return {"error": "Pega la clave del conector (Prezio › Inventarios › Conector de SQL Server)."}
        try:
            info = pc.estado_prezio(prueba)
        except pc.ErrorPrezio as e:
            return {"error": "Prezio rechazó la clave: crea un conector nuevo y copia su clave." if e.estado == 401 else str(e)}
        cfg.update(sitio=sitio, clave=prueba["clave"])
        self._guardar(cfg)
        return {"ok": True, "negocio": info["negocio"]["nombre"], "conector": info["conector"]["nombre"],
                "inventarios": [{"id": i["id"], "nombre": i["nombre"]} for i in info.get("inventarios", [])]}

    # ---- paso 2: SQL Server
    def conectar_sql(self, datos):
        cfg = self._cfg()
        sql = self._sql(datos or {}, cfg)
        if not sql["servidor"]:
            return {"error": "Escribe el servidor (ej.: localhost\\SQLEXPRESS o 192.168.1.10,1433)."}
        if sql["modo"] == "sql" and (not sql["usuario"] or not sql["clave"]):
            return {"error": "Escribe el usuario y la clave de SQL Server."}
        try:
            bases = self.catalogo.bases(sql)
        except Exception as e:
            return {"error": mensaje(e)}
        cfg["sql"] = sql
        self._guardar(cfg)
        return {"ok": True, "bases": bases, "base": sql.get("base") if sql.get("base") in bases else (bases[0] if bases else "")}

    def elegir_base(self, base):
        cfg = self._cfg()
        if not cfg.get("sql"):
            return {"error": "Primero conecta con SQL Server."}
        cfg["sql"]["base"] = str(base)
        try:
            tablas = self.catalogo.tablas(cfg["sql"])
        except Exception as e:
            return {"error": mensaje(e)}
        self._guardar(cfg)
        return {"ok": True, "tablas": tablas}

    # ---- paso 3: tabla y columnas de cada inventario
    def columnas(self, tabla):
        cfg = self._cfg()
        try:
            cols = self.catalogo.columnas(cfg["sql"], str(tabla))
        except Exception as e:
            return {"error": mensaje(e)}
        nombres = [c["nombre"] for c in cols]
        return {"ok": True, "columnas": cols, "sugeridas": {k: sugerir(nombres, k) for k in SUGERENCIAS}}

    def muestra(self, mapeo):
        cfg = self._cfg()
        try:
            filas, total = self.catalogo.muestra(cfg["sql"], mapeo)
        except Exception as e:
            return {"error": mensaje(e)}
        productos = pc.productos_de(filas)
        return {"ok": True, "total": total, "validos_muestra": len(productos), "muestra": productos[:8]}

    def guardar_inventario(self, inventario_id, mapeo):
        cfg = self._cfg()
        try:
            pc.consulta_de(mapeo)              # valida tabla y columnas, o que la consulta propia sea un SELECT
        except (ValueError, KeyError) as e:
            return {"error": str(e) or "Elige la tabla y las tres columnas."}
        limpio = {"consulta": mapeo["consulta"].strip()} if mapeo.get("consulta") else \
            {k: str(mapeo[k]) for k in ("tabla", "codigo", "nombre", "precio")}
        cfg.setdefault("inventarios", {})[str(inventario_id)] = limpio
        self._guardar(cfg)
        return {"ok": True}

    def quitar_inventario(self, inventario_id):
        cfg = self._cfg()
        (cfg.get("inventarios") or {}).pop(str(inventario_id), None)
        self._guardar(cfg)
        return {"ok": True}

    # ---- paso 4: frecuencia, enviar y arranque
    def guardar_frecuencia(self, minutos):
        cfg = self._cfg()
        cfg["cada_min"] = max(1, min(1440, int(minutos or 10)))
        self._guardar(cfg)
        return {"ok": True}

    def enviar_ahora(self):
        if not self._ocupado.acquire(blocking=False):
            return {"error": "Ya se está enviando. Espera un momento."}
        try:
            r = pc.sincronizar(self._cfg(), self.conectar)
            return {"ok": True, **r}
        except pc.ErrorPrezio as e:
            return {"error": "Prezio rechazó la clave del conector." if e.estado == 401 else str(e)}
        except Exception as e:
            return {"error": mensaje(e)}
        finally:
            self._ocupado.release()

    def _tarea_instalada(self):
        if os.name != "nt":
            return False
        r = subprocess.run(["schtasks", "/Query", "/TN", TAREA], capture_output=True, text=True, creationflags=0x08000000)
        return r.returncode == 0

    def arranque(self, activar):
        """Crear o quitar la tarea de Windows (pide permiso de administrador con la ventana de Windows)."""
        if os.name != "nt":
            return {"error": "Solo en Windows."}
        import ctypes
        exe = sys.executable if getattr(sys, "frozen", False) else sys.executable
        argumentos = ("--instalar" if activar else "--desinstalar") if getattr(sys, "frozen", False) \
            else f'"{Path(__file__).resolve()}" ' + ("--instalar" if activar else "--desinstalar")
        r = ctypes.windll.shell32.ShellExecuteW(None, "runas", exe, argumentos, None, 0)
        if r <= 32:
            return {"error": "Windows no dio permiso de administrador."}
        for _ in range(20):
            time.sleep(0.5)
            if self._tarea_instalada() == bool(activar):
                return {"ok": True, "inicio": bool(activar)}
        return {"error": "No se pudo confirmar el cambio. Vuelve a intentarlo."}

    def registro(self):
        ruta = pc.CARPETA / "conector.log"
        try:
            lineas = ruta.read_text(encoding="utf-8", errors="replace").splitlines()[-40:]
        except OSError:
            lineas = []
        return {"ok": True, "lineas": lineas}

    # ---- panel y actualizaciones
    def abrir_panel(self):
        import webview
        webview.create_window("Prezio · Panel", (self._cfg().get("sitio") or SITIO) + "/negocios",
                              width=1280, height=860, min_size=(900, 600))
        return {"ok": True}

    def version_nueva(self):
        try:
            pedido = urllib.request.Request(f"{self._cfg().get('sitio') or SITIO}/apps.json?t={int(time.time())}",
                                            headers={"Cache-Control": "no-cache", "User-Agent": "PrezioAdministrador/" + VERSION})
            with urllib.request.urlopen(pedido, timeout=10) as r:
                info = json.loads(r.read().decode("utf-8")).get("administrador") or {}
            nueva = str(info.get("version") or "")
            if nueva and _version_mayor(nueva, VERSION) and str(info.get("url", "")).startswith("https://github.com/"):
                return {"ok": True, "version": nueva, "url": info["url"]}
        except Exception:
            pass
        return {"ok": True, "version": None}

    def abrir_enlace(self, url):
        if str(url).startswith("https://"):
            webbrowser.open(str(url))
        return {"ok": True}


def _version_mayor(a, b):
    def partes(v):
        try:
            return [int(x) for x in str(v).split(".")[:3]]
        except ValueError:
            return [0, 0, 0]
    return partes(a) > partes(b)


# ---------------------------------------------------------------- arranque
def instalar_tarea():
    destino = f'"{sys.executable}" --servicio' if getattr(sys, "frozen", False) \
        else f'"{sys.executable}" "{Path(__file__).resolve()}" --servicio'
    r = subprocess.run(["schtasks", "/Create", "/F", "/TN", TAREA, "/SC", "ONSTART", "/RU", "SYSTEM", "/RL", "HIGHEST",
                        "/TR", destino], capture_output=True, text=True)
    if r.returncode == 0:
        subprocess.run(["schtasks", "/Run", "/TN", TAREA], capture_output=True)
    return r.returncode


def main():
    args = sys.argv[1:]
    if "--servicio" in args:
        pc.preparar_registro(consola=False)
        cfg = pc.leer_json(pc.CONFIG, None)
        if not cfg:
            pc.log.error("Falta configurar: abre Prezio Administrador › Conector de SQL Server.")
            sys.exit(2)
        pc.trabajar(cfg)
        return
    if "--instalar" in args:
        sys.exit(instalar_tarea())
    if "--desinstalar" in args:
        sys.exit(subprocess.run(["schtasks", "/Delete", "/F", "/TN", TAREA], capture_output=True).returncode)
    pc.preparar_registro(consola=False)
    import webview
    api = Api()
    webview.create_window("Prezio Administrador", str(AQUI / "interfaz.html"), js_api=api,
                          width=1180, height=820, min_size=(860, 600), background_color="#F4F6F8")
    datos = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "Prezio" / "Administrador"
    datos.mkdir(parents=True, exist_ok=True)
    # private_mode=False: el panel recuerda la sesión entre aperturas.
    webview.start(gui="edgechromium", private_mode=False, storage_path=str(datos))


if __name__ == "__main__":
    main()
