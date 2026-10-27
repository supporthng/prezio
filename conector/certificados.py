"""Prezio · certificados para HTTPS.

Windows trae sus certificados raíz «a pedido», y a veces a una PC le falta el de GitHub o el de Vercel: la
descarga falla con «CERTIFICATE_VERIFY_FAILED: unable to get local issuer certificate» aunque el navegador
funcione. Aquí se juntan los certificados de Windows con los de la lista pública de Mozilla (paquete certifi)
y se usan en todas las conexiones HTTPS de la app. Sigue verificando todo: no se desactiva ninguna comprobación.
"""
import ssl

_contexto = None


def contexto() -> ssl.SSLContext:
    global _contexto
    if _contexto is None:
        ctx = ssl.create_default_context()  # ya incluye el almacén de certificados de Windows
        try:
            import certifi

            ctx.load_verify_locations(cafile=certifi.where())
        except Exception:
            pass
        _contexto = ctx
    return _contexto


def instalar() -> None:
    """Hace que urllib (y todo lo que lo use) verifique con los certificados de arriba."""
    ctx = contexto()
    ssl._create_default_https_context = lambda *a, **k: ctx  # type: ignore[assignment]
