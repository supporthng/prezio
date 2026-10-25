import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config";
import { supabaseAdmin, problemaClaveSecreta } from "@/lib/supabase/admin";

/** La app Prezio Administrador abre el panel con una sesión PROPIA (no comparte la de la app):
 *  manda su token de acceso (que ya prueba quién es) y recibe un enlace de un solo uso que abre en su ventana.
 *  El enlace pasa por /auth/confirm, que crea la sesión del panel. Vence en minutos y sirve una vez. */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || token.length > 4000) return NextResponse.json({ error: "Falta la sesión" }, { status: 401 });
  { const p = problemaClaveSecreta(); if (p) return NextResponse.json({ error: p }, { status: 503 }); }
  const publico = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: quien, error } = await publico.auth.getUser(token);
  if (error || !quien.user?.email) return NextResponse.json({ error: "La sesión venció: vuelve a entrar en la app" }, { status: 401 });
  const { data, error: e2 } = await supabaseAdmin().auth.admin.generateLink({ type: "magiclink", email: quien.user.email });
  const hash = data?.properties?.hashed_token;
  if (e2 || !hash) return NextResponse.json({ error: "No se pudo abrir el panel" }, { status: 502 });
  return NextResponse.json({ token_hash: hash, tipo: "magiclink" }, { headers: { "Cache-Control": "no-store" } });
}
