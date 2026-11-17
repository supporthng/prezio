import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL, variablesFaltantes } from "./config";
import { dominioCookies } from "@/lib/subdominio";

type CookieNueva = { name: string; value: string; options: CookieOptions };

const PRIVADAS = ["/negocios", "/n/", "/v/"];

/** Renueva la sesión en cada pedido y manda a /entrar a quien entra sin sesión a una página privada.
 *  `interna`: la ruta que se sirve en un subdominio (onetech.prezcio.app/ → /n/onetech), sin cambiar la dirección. */
export async function actualizarSesion(request: NextRequest, interna: string | null = null, base = "") {
  const seguir = () => {
    if (!interna) return NextResponse.next({ request });
    const url = request.nextUrl.clone();
    url.pathname = interna;
    return NextResponse.rewrite(url, { request });
  };
  // Sin configurar Supabase, no se corta el sitio: la página de inicio dice qué falta.
  if (variablesFaltantes().length) return seguir();
  try {
    return await revisar(request, seguir, interna ?? request.nextUrl.pathname, base);
  } catch {
    return seguir();   // Supabase no respondió: la página lo maneja
  }
}

async function revisar(request: NextRequest, seguir: () => NextResponse, ruta: string, base: string) {
  let respuesta = seguir();
  const dominio = dominioCookies(request.headers.get("host") ?? "", base);
  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      ...(dominio ? { cookieOptions: { domain: dominio } } : {}),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(lista: CookieNueva[]) {
          lista.forEach(({ name, value }) => request.cookies.set(name, value));
          respuesta = seguir();
          lista.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options));
        },
      },
    },
  );
  const { data } = await supabase.auth.getUser();
  if (!data.user && PRIVADAS.some((p) => ruta === p || ruta.startsWith(p.endsWith("/") ? p : p + "/"))) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/entrar";
    destino.search = "";
    destino.searchParams.set("siguiente", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(destino);
  }
  return respuesta;
}
