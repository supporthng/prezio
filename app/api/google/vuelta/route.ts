import { NextResponse, type NextRequest } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import { dominioBase, dominioCookies } from "@/lib/subdominio";
import { mensajeError, sitio } from "@/lib/util";
import { canjearCodigo, cifrar, descifrar } from "@/lib/googleServidor";

export const dynamic = "force-dynamic";

type Pendiente = { estado: string; verificador: string; negocio: string; volver: string; usuario: string };

/** Google vuelve aquí con el código: se canjea por el permiso duradero, se guarda cifrado y se regresa a Inventarios. */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const base = dominioBase(sitio() || "https://prezcio.app");
  let p: Pendiente | null = null;
  try { p = JSON.parse(descifrar(request.cookies.get("prezcio_google")?.value ?? "")) as Pendiente; } catch { p = null; }
  const volver = p?.volver || `${sitio()}/negocios`;
  const ir = (clave: "error" | "google", valor: string) => {
    const r = NextResponse.redirect(`${volver}${volver.includes("?") ? "&" : "?"}${clave}=${encodeURIComponent(valor)}`, 303);
    r.cookies.set("prezcio_google", "", { maxAge: 0, path: "/", domain: dominioCookies(host, base) });
    return r;
  };
  if (!p || !q.get("state") || q.get("state") !== p.estado) return ir("error", "La conexión con Google venció. Toca «Conectar Google Drive» otra vez.");
  if (q.get("error")) return ir("error", q.get("error") === "access_denied" ? "No se conectó Google Drive: no se dio el permiso." : `Google respondió: ${q.get("error")}`);
  const codigo = q.get("code");
  if (!codigo) return ir("error", "Google no envió el código. Intenta de nuevo.");

  const supabase = await supabaseServidor();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || auth.user.id !== p.usuario) return ir("error", "Vuelve a entrar a Prezcio con la misma cuenta y conecta otra vez.");
  try {
    const { refresh, correo } = await canjearCodigo(codigo, `${sitio() || "https://prezcio.app"}/api/google/vuelta`, p.verificador);
    const { data, error } = await supabase.rpc("google_guardar_cuenta", { p_negocio: p.negocio, p_correo: correo, p_cifrado: cifrar(refresh) });
    if (error) return ir("error", mensajeError(error));
    return ir("google", String(data));
  } catch (e) {
    return ir("error", e instanceof Error ? e.message : "No se pudo conectar Google Drive.");
  }
}
