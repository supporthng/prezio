import { NextResponse, type NextRequest } from "next/server";
import { actualizarSesion } from "@/lib/supabase/middleware";
import { dominioBase, subdominioDe } from "@/lib/subdominio";

const SITIO = (process.env.NEXT_PUBLIC_SITE_URL || "https://prezcio.app").replace(/\/$/, "");
const BASE = dominioBase(SITIO);

export async function middleware(request: NextRequest) {
  // onetech.prezcio.app → prezcio.app/n/onetech (y /verificador → /v/onetech). La sesión vive en el dominio principal.
  const sub = subdominioDe(request.headers.get("host") ?? "", BASE);
  if (sub) {
    const ruta = request.nextUrl.pathname;
    const destino = ruta === "/verificador" || ruta.startsWith("/verificador/") ? `/v/${sub}${ruta.slice("/verificador".length)}`
      : `/n/${sub}${ruta === "/" ? "" : ruta}`;
    return NextResponse.redirect(`${SITIO}${destino}${request.nextUrl.search}`, 307);
  }
  return actualizarSesion(request);
}

export const config = {
  // Node.js (no Edge): la librería de Supabase usa funciones de Node que en Edge hacen fallar el middleware.
  runtime: "nodejs",
  // Todo menos archivos estáticos e imágenes.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|iconos/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
