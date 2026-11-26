import { NextResponse, type NextRequest } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await supabaseServidor();
  await supabase.auth.signOut();
  // Solo destinos propios y conocidos.
  const destino = request.nextUrl.searchParams.get("siguiente") === "/entrar" ? "/entrar" : "/";
  return NextResponse.redirect(new URL(destino, request.url), { status: 303 });
}
