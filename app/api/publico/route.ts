import { NextResponse } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

/** Datos PÚBLICOS para la app Prezio Administrador (los mismos que ya lleva cualquier página de Prezio):
 *  la dirección de Supabase y su clave publicable. Nunca la clave secreta. */
export function GET() {
  return NextResponse.json({ supabase_url: SUPABASE_URL, clave_publica: SUPABASE_KEY, version_app: 2 },
    { headers: { "Cache-Control": "public, max-age=300" } });
}
