"use server";

import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensajeError, sitio } from "@/lib/util";

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

/**
 * «Olvidé mi clave» de la Plataforma: envía el enlace de Supabase al correo. El enlace abre
 * /plataforma/clave, que antes pide el código de verificación en 2 pasos: el correo solo no basta.
 */
export async function recuperarPlataforma(d: FormData) {
  const correo = String(d.get("correo") ?? "").trim().toLowerCase();
  if (correo) {
    const supabase = await supabaseServidor();
    await supabase.auth.resetPasswordForEmail(correo, {
      redirectTo: `${sitio()}/auth/confirm?siguiente=${encodeURIComponent("/plataforma/clave")}`,
    });
  }
  // Mismo mensaje exista o no la cuenta (no revela qué correos están registrados).
  redirect(`/plataforma/entrar?bien=${encodeURIComponent("Si el correo es de la Plataforma, te enviamos un enlace para cambiar la clave. Revisa también el correo no deseado.")}`);
}

/** Guarda la clave nueva; solo con la sesión verificada en 2 pasos. */
export async function cambiarClavePlataforma(d: FormData) {
  const clave = String(d.get("clave") ?? "");
  const repite = String(d.get("repite") ?? "");
  const volverClave = (e: string): never => redirect(`/plataforma/clave?error=${encodeURIComponent(e)}`);
  if (clave.length < 10) volverClave("La clave debe tener al menos 10 caracteres.");
  if (clave !== repite) volverClave("Las dos claves no coinciden.");
  const supabase = await supabaseServidor();
  const { data: m } = await supabase.rpc("plataforma_miembro");
  if (!m || !(m as { verificado: boolean }).verificado) redirect("/plataforma/verificar?siguiente=/plataforma/clave");
  const { error } = await supabase.auth.updateUser({ password: clave });
  if (error) volverClave(/same|different/i.test(error.message) ? "La clave nueva debe ser distinta a la anterior." : mensajeError(error));
  redirect(`/plataforma?bien=${encodeURIComponent("Clave cambiada.")}`);
}
