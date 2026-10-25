import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServidor } from "@/lib/supabase/server";
import { rutaSegura } from "@/lib/util";

/** Enlace de los correos de Supabase (confirmar cuenta, cambiar clave): inicia la sesión y sigue. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const siguiente = rutaSegura(url.searchParams.get("siguiente"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const tipo = url.searchParams.get("type") as EmailOtpType | null;
  const supabase = await supabaseServidor();
  let error: { message: string } | null = null;
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && tipo) {
    ({ error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash }));
  } else {
    error = { message: "Enlace incompleto" };
  }
  const destino = url.clone();
  destino.search = "";
  if (error) {
    destino.pathname = "/entrar";
    destino.searchParams.set("error", "El enlace venció o ya se usó. Entra con tu clave o pide otro.");
  } else {
    const [ruta, consulta] = siguiente.split("?");
    destino.pathname = ruta;
    if (consulta) destino.search = "?" + consulta;
  }
  return NextResponse.redirect(destino);
}
