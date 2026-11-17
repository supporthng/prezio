"""Prezcio Plataforma: la administración del portal (tu Plataforma) como app de Windows.

- Abre SITIO/plataforma en una ventana normal (maximizada), con WebView2 (el motor de Microsoft Edge).
- La sesión queda guardada en la PC: entras una vez con tu cuenta de la Plataforma.
- Solo navega dentro de Prezcio; los enlaces de afuera (WhatsApp, descargas) se abren en el navegador.
- Se actualiza: al abrir y cada hora revisa SITIO/apps.json; si hay versión nueva, pregunta antes de instalarla.
- Una sola copia abierta a la vez.
No guarda datos de los negocios: solo lo que la Plataforma ya muestra (licencias, pagos, planes).
"""
import ctypes
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from ctypes import wintypes

import webview

# La compilación (GitHub Actions) reemplaza estos tres valores.
SITIO = "https://prezcio.app"
VERSION = "1.0.0"
# Solo se aceptan actualizaciones publicadas en las descargas de Prezcio.
ORIGEN_ACTUALIZACION = "https://github.com/supporthng/prezio/releases/download/"
DIRECCION = SITIO + "/plataforma"
CARPETA = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "PrezcioPlataforma")
DATOS = os.path.join(CARPETA, "WebView")
REGISTRO = os.path.join(CARPETA, "actualizacion.log")
APPS_JSON = SITIO + "/apps.json"
CLAVE_APPS = "plataforma"
CADA_REVISION_S = 60 * 60


def anotar(texto):
    try:
        os.makedirs(CARPETA, exist_ok=True)
        if os.path.exists(REGISTRO) and os.path.getsize(REGISTRO) > 200_000:
            os.replace(REGISTRO, REGISTRO + ".1")
        with open(REGISTRO, "a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + texto + "\n")
    except Exception:
        pass


def version_mayor(a, b):
    def partes(v):
        try:
            p = [int(x) for x in str(v).split(".")[:3]]
            return p + [0] * (3 - len(p))
        except ValueError:
            return [0, 0, 0]
    return partes(a) > partes(b)


def url_permitida(url):
    return isinstance(url, str) and url.startswith(ORIGEN_ACTUALIZACION) and url.endswith(".exe")


def ya_abierta():
    if os.name != "nt":
        return False
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.CreateMutexW.restype = wintypes.HANDLE
    kernel32.CreateMutexW(None, False, "Local\\PrezcioPlataforma")
    return ctypes.get_last_error() == 183   # ERROR_ALREADY_EXISTS


class Plataforma:
    def __init__(self):
        self._ventana = None
        self._actualizando = False
        self._rechazada = ""          # versión que el usuario dejó para después (no se vuelve a preguntar hasta reabrir)

    def _revisar(self):
        try:
            pedido = urllib.request.Request(f"{APPS_JSON}?t={int(time.time())}",
                                            headers={"Cache-Control": "no-cache", "User-Agent": "PrezcioPlataforma/" + VERSION})
            with urllib.request.urlopen(pedido, timeout=20) as r:
                info = json.loads(r.read().decode("utf-8")).get(CLAVE_APPS) or {}
            nueva, url = str(info.get("version") or ""), str(info.get("url") or "")
            if nueva and version_mayor(nueva, VERSION) and nueva != self._rechazada and not self._actualizando:
                if not url_permitida(url):
                    anotar(f"actualización rechazada (dirección no permitida): {url!r}")
                    return True
                if self._ventana.create_confirmation_dialog(
                        "Prezcio Plataforma", f"Hay una versión nueva ({nueva}). ¿Instalarla ahora? La app se cierra y vuelve a abrir."):
                    self._actualizando = True
                    threading.Thread(target=self._actualizar, args=(url,), daemon=True).start()
                else:
                    self._rechazada = nueva
            return True
        except Exception as exc:
            anotar(f"no se pudo revisar apps.json ({exc})")
            return False

    def revisar_cada_rato(self):
        time.sleep(8)
        while True:
            self._revisar()
            time.sleep(CADA_REVISION_S)

    def _actualizar(self, url):
        try:
            anotar(f"descargando {url}")
            destino = os.path.join(tempfile.gettempdir(), f"Instalador_Prezcio_Plataforma_{int(time.time())}.exe")
            pedido = urllib.request.Request(url, headers={"User-Agent": "PrezcioPlataforma/" + VERSION})
            with urllib.request.urlopen(pedido, timeout=180) as respuesta, open(destino, "wb") as archivo:
                while True:
                    bloque = respuesta.read(1 << 16)
                    if not bloque:
                        break
                    archivo.write(bloque)
            with open(destino, "rb") as f:
                es_exe = f.read(2) == b"MZ"
            if os.path.getsize(destino) < 500_000 or not es_exe:
                raise RuntimeError("la descarga no es un instalador válido")
            subprocess.Popen([destino, "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/CLOSEAPPLICATIONS"],
                             close_fds=True, creationflags=0x00000008 | 0x00000200)  # DETACHED | NEW_GROUP
            time.sleep(1)
            self._ventana.destroy()
        except Exception as exc:
            anotar(f"error al actualizar: {exc}")
            self._actualizando = False


def main():
    if ya_abierta():
        sys.exit(0)
    os.makedirs(DATOS, exist_ok=True)
    if hasattr(webview, "settings"):
        webview.settings["OPEN_EXTERNAL_LINKS_IN_BROWSER"] = True
    app = Plataforma()
    opciones = dict(width=1280, height=820, min_size=(900, 600), background_color="#102A43", confirm_close=False)
    try:
        ventana = webview.create_window(f"Prezcio Plataforma {VERSION}", DIRECCION, maximized=True, **opciones)
    except TypeError:   # pywebview sin «maximized»: abre a 1280×820
        ventana = webview.create_window(f"Prezcio Plataforma {VERSION}", DIRECCION, **opciones)
    app._ventana = ventana
    threading.Thread(target=app.revisar_cada_rato, name="revisar-actualizacion", daemon=True).start()
    # private_mode=False + storage_path: la sesión se guarda y no hay que entrar cada vez.
    webview.start(gui="edgechromium", private_mode=False, storage_path=DATOS, debug=False)


if __name__ == "__main__":
    main()
