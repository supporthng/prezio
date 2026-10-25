import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL, variablesFaltantes } from "./config";

type CookieNueva = { name: string; value: string; options: CookieOptions };

const PRIVADAS = ["/negocios", "/n/"];

/** Renueva la sesión en cada pedido y manda a /entrar a quien entra sin sesión a una página privada. */
export async function actualizarSesion(request: NextRequest) {
  const respuesta = NextResponse.next({ request });
  // Sin configurar Supabase, no se corta el sitio: la página de inicio dice qué falta.
  if (variablesFaltantes().length) return respuesta;
  try {
    return await revisar(request, respuesta);
  } catch {
    return NextResponse.next({ request });   // Supabase no respondió: la página lo maneja
  }
}

async function revisar(request: NextRequest, inicial: NextResponse) {
  let respuesta = inicial;
  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(lista: CookieNueva[]) {
          lista.forEach(({ name, value }) => request.cookies.set(name, value));
          respuesta = NextResponse.next({ request });
          lista.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options));
        },
      },
    },
  );
  const { data } = await supabase.auth.getUser();
  const ruta = request.nextUrl.pathname;
  if (!data.user && PRIVADAS.some((p) => ruta === p || ruta.startsWith(p.endsWith("/") ? p : p + "/"))) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/entrar";
    destino.search = "";
    destino.searchParams.set("siguiente", ruta + request.nextUrl.search);
    return NextResponse.redirect(destino);
  }
  return respuesta;
}
