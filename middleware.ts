import { NextResponse, type NextRequest } from "next/server";
import { actualizarSesion } from "@/lib/supabase/middleware";
import { dominioBase, rutaDeSubdominio, subdominioDe } from "@/lib/subdominio";

const BASE = dominioBase((process.env.NEXT_PUBLIC_SITE_URL || "https://prezcio.app").replace(/\/$/, ""));

export async function middleware(request: NextRequest) {
  // onetech.prezcio.app muestra el panel de onetech sin cambiar la dirección (y /verificador, su verificador).
  const host = request.headers.get("host") ?? "";
  // www.prezcio.app → prezcio.app: una sola dirección (Google Drive y las sesiones dependen de ella).
  if (BASE && host.toLowerCase() === `www.${BASE}`) {
    const destino = request.nextUrl.clone();
    destino.host = BASE; destino.port = ""; destino.protocol = "https:";
    return NextResponse.redirect(destino, 308);
  }
  const sub = subdominioDe(host, BASE);
  const interna = sub ? rutaDeSubdominio(sub, request.nextUrl.pathname) : null;
  return actualizarSesion(request, interna, BASE);
}

export const config = {
  // Node.js (no Edge): la librería de Supabase usa funciones de Node que en Edge hacen fallar el middleware.
  runtime: "nodejs",
  // Todo menos archivos estáticos e imágenes.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|plataforma\\.webmanifest|negocio\\.webmanifest|propuesta|cotizacion|iconos/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|pdf)$).*)"],
};
