"use server";

import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/util";

const volver = (error: string): never => redirect(`/plataforma/entrar?error=${encodeURIComponent(error)}`);

/** Entrar a la Plataforma: solo cuentas de la Plataforma (cualquier otra cuenta se cierra al momento). */
export async function entrarPlataforma(d: FormData) {
  const supabase = await supabaseServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(d.get("correo") ?? "").trim().toLowerCase(),
    password: String(d.get("clave") ?? ""),
  });
  if (error) volver(/invalid/i.test(error.message) ? "Correo o clave incorrectos." : mensajeError(error));
  const { data: m } = await supabase.rpc("plataforma_miembro");
  if (!m) {
    await supabase.auth.signOut();
    volver("Esta cuenta no es de la Plataforma de Prezcio.");
  }
  // Segundo paso: el código de la app de autenticación (o configurarla la primera vez).
  redirect("/plataforma/verificar");
}
