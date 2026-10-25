import type { NextRequest } from "next/server";
import { actualizarSesion } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return actualizarSesion(request);
}

export const config = {
  // Node.js (no Edge): la librería de Supabase usa funciones de Node que en Edge hacen fallar el middleware.
  runtime: "nodejs",
  // Todo menos archivos estáticos e imágenes.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|iconos/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
