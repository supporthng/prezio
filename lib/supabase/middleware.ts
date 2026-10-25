import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PRIVADAS = ["/negocios", "/n/"];

/** Renueva la sesión en cada pedido y manda a /entrar a quien entra sin sesión a una página privada. */
export async function actualizarSesion(request: NextRequest) {
  let respuesta = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(lista) {
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
