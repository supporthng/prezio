import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { supabaseServidor } from "@/lib/supabase/server";
import { dominioBase, dominioCookies } from "@/lib/subdominio";
import { sitio } from "@/lib/util";
import { cifrar, driveServidorListo, enlaceAutorizar, pkce } from "@/lib/googleServidor";

export const dynamic = "force-dynamic";

/** Conectar Google Drive: va a la página de Google (pantalla completa, funciona en Safari) y vuelve a /api/google/vuelta. */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const negocio = q.get("negocio") ?? "";
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const base = dominioBase(sitio() || "https://prezcio.app");
  const ruta = (q.get("volver") ?? "/").startsWith("/") && !(q.get("volver") ?? "").startsWith("//") ? q.get("volver")! : "/";
  // Volver a la misma dirección desde la que se pidió (la del negocio o prezcio.app), nunca a otra web.
  const volver = (base && (host === base || host.endsWith("." + base)) ? `https://${host}` : sitio()) + ruta;
  const fallo = (m: string) => NextResponse.redirect(`${volver}${volver.includes("?") ? "&" : "?"}error=${encodeURIComponent(m)}`, 303);

  if (!driveServidorListo()) return fallo("Google Drive todavía no está listo en Prezcio: falta GOOGLE_CLIENT_SECRET en Vercel.");
  if (!/^[0-9a-f-]{36}$/.test(negocio)) return fallo("Falta el negocio.");
  const supabase = await supabaseServidor();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fallo("Vuelve a entrar a Prezcio.");
  const { data: puede } = await supabase.rpc("google_puede", { p_negocio: negocio });
  if (!puede) return fallo("No tienes permiso para conectar Google Drive en este negocio.");

  const estado = randomBytes(24).toString("base64url");
  const { verificador, reto } = pkce();
  const regreso = `${sitio() || "https://prezcio.app"}/api/google/vuelta`;
  const r = NextResponse.redirect(enlaceAutorizar(regreso, estado, reto), 303);
  // Cifrado: nadie puede armar uno a mano. Dura 10 minutos y vale para prezcio.app y sus subdominios.
  r.cookies.set("prezcio_google", cifrar(JSON.stringify({ estado, verificador, negocio, volver, usuario: auth.user.id })), {
    httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/", domain: dominioCookies(host, base),
  });
  return r;
}
