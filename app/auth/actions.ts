"use server";

import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensajeError, rutaSegura, sitio } from "@/lib/util";

function texto(datos: FormData, campo: string): string {
  const v = datos.get(campo);
  return typeof v === "string" ? v.trim() : "";
}

export async function entrar(datos: FormData) {
  const siguiente = rutaSegura(texto(datos, "siguiente"));
  const supabase = await supabaseServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: texto(datos, "correo").toLowerCase(),
    password: String(datos.get("clave") ?? ""),
  });
  if (error) {
    redirect(`/entrar?error=${encodeURIComponent(mensajeError(error))}&siguiente=${encodeURIComponent(siguiente)}`);
  }
  redirect(siguiente);
}

export async function registrarse(datos: FormData) {
  const siguiente = rutaSegura(texto(datos, "siguiente"));
  const clave = String(datos.get("clave") ?? "");
  const volver = (m: string) =>
    redirect(`/registro?error=${encodeURIComponent(m)}&siguiente=${encodeURIComponent(siguiente)}`);
  if (clave.length < 8) volver("La clave debe tener al menos 8 caracteres.");
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.auth.signUp({
    email: texto(datos, "correo").toLowerCase(),
    password: clave,
    options: {
      data: { nombre: texto(datos, "nombre").slice(0, 80) },
      emailRedirectTo: `${sitio()}/auth/confirm?siguiente=${encodeURIComponent(siguiente)}`,
    },
  });
  if (error) volver(mensajeError(error));
  // Con la confirmación por correo desactivada en Supabase, la sesión ya viene iniciada.
  if (data.session) redirect(siguiente);
  redirect(`/registro?enviado=1`);
}

export async function recuperar(datos: FormData) {
  const supabase = await supabaseServidor();
  await supabase.auth.resetPasswordForEmail(texto(datos, "correo").toLowerCase(), {
    redirectTo: `${sitio()}/auth/confirm?siguiente=${encodeURIComponent("/cuenta/clave")}`,
  });
  // Mismo mensaje exista o no la cuenta (no revela qué correos están registrados).
  redirect(`/entrar?bien=${encodeURIComponent("Si el correo tiene cuenta, te enviamos un enlace para cambiar la clave.")}`);
}

export async function cambiarClave(datos: FormData) {
  const clave = String(datos.get("clave") ?? "");
  if (clave.length < 8) redirect(`/cuenta/clave?error=${encodeURIComponent("La clave debe tener al menos 8 caracteres.")}`);
  const supabase = await supabaseServidor();
  const { error } = await supabase.auth.updateUser({ password: clave });
  if (error) redirect(`/cuenta/clave?error=${encodeURIComponent(mensajeError(error))}`);
  redirect(`/negocios?bien=${encodeURIComponent("Clave cambiada.")}`);
}
