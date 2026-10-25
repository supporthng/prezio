"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServidor } from "@/lib/supabase/server";
import { supabaseAdmin, hayClaveSecreta, correoDeUsuario, USUARIO_VALIDO } from "@/lib/supabase/admin";
import { mensajeError, sitio } from "@/lib/util";

const campo = (d: FormData, n: string) => String(d.get(n) ?? "").trim();
const volver = (error: unknown, bien = ""): never => {
  revalidatePath("/plataforma");
  redirect(`/plataforma?${error ? "error=" + encodeURIComponent(typeof error === "string" ? error : mensajeError(error as { message?: string })) : "bien=" + encodeURIComponent(bien)}`);
};
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function soloPlataforma() {
  const supabase = await supabaseServidor();
  const { data } = await supabase.rpc("es_plataforma");
  if (!data) volver("Solo la plataforma puede hacer esto.");
  if (!hayClaveSecreta()) volver("Falta la clave secreta de Supabase en Vercel (SUPABASE_SECRET_KEY): sin ella no se crean cuentas.");
  return supabase;
}

/** Le pone dueño a un negocio: cuenta sin correo (usuario + clave) o invitación por correo. Devuelve el aviso. */
async function ponerDueno(supabase: SupabaseClient, negocio: { id: string; slug: string }, d: FormData): Promise<{ error?: string; bien?: string }> {
  const nombre = campo(d, "dueno_nombre").slice(0, 80);
  const admin = supabaseAdmin();
  if (campo(d, "acceso") === "correo") {
    const correo = campo(d, "correo").toLowerCase();
    if (!CORREO.test(correo) || correo.endsWith(".prezio.invalid")) return { error: "Escribe un correo válido para el dueño." };
    const { data: existe } = await supabase.rpc("plataforma_cuenta_de_correo", { p_correo: correo });
    let cuenta = existe ? String(existe) : "";
    let aviso: string;
    if (cuenta) {
      aviso = `${correo} ya tenía cuenta: entra con su correo y su clave de siempre y verá «${negocio.slug}».`;
    } else {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(correo, {
        redirectTo: `${sitio()}/auth/sesion?siguiente=${encodeURIComponent(`/n/${negocio.slug}`)}`,
        data: { nombre },
      });
      if (error || !data.user) return { error: "No se pudo enviar la invitación: " + mensajeError(error) + ". Revisa el correo propio (SMTP) en Supabase." };
      cuenta = data.user.id;
      aviso = `Invitación enviada a ${correo}: abre el enlace, elige su clave y entra a su negocio.`;
    }
    const { error } = await supabase.rpc("plataforma_poner_dueno", { p_negocio: negocio.id, p_cuenta: cuenta, p_usuario: null, p_nombre: nombre || null });
    return error ? { error: mensajeError(error) } : { bien: aviso };
  }
  const usuario = campo(d, "usuario").toLowerCase(), clave = String(d.get("clave") ?? "");
  if (!USUARIO_VALIDO.test(usuario)) return { error: "El usuario del dueño: de 3 a 30 letras minúsculas, números, punto, guion o guion bajo." };
  if (clave.length < 8) return { error: "La clave del dueño debe tener al menos 8 caracteres." };
  const { data: creada, error: e1 } = await admin.auth.admin.createUser({
    email: correoDeUsuario(negocio.id, usuario), password: clave, email_confirm: true, user_metadata: { nombre, usuario },
  });
  if (e1 || !creada.user) return { error: /already|registered|exists/i.test(e1?.message ?? "") ? `Ya existe el usuario «${usuario}» en este negocio.` : mensajeError(e1) };
  const { error: e2 } = await supabase.rpc("plataforma_poner_dueno", { p_negocio: negocio.id, p_cuenta: creada.user.id, p_usuario: usuario, p_nombre: nombre || null });
  if (e2) {
    await admin.auth.admin.deleteUser(creada.user.id).catch(() => {});
    return { error: mensajeError(e2) };
  }
  return { bien: `Entrega al dueño: código del negocio «${negocio.slug}», usuario «${usuario}» y la clave que escribiste. Entra en Prezio › Entrar › Con usuario, o en la app Prezio Administrador.` };
}

export async function altaNegocio(d: FormData) {
  const supabase = await soloPlataforma();
  const { data, error } = await supabase.rpc("plataforma_crear_negocio", {
    p_nombre: campo(d, "nombre"), p_slug: campo(d, "slug").toLowerCase() || null,
    p_moneda: campo(d, "moneda") || "RD$", p_plan: campo(d, "plan") || "prueba",
  });
  if (error || !data) volver(error ?? "No se pudo crear el negocio.");
  const negocio = data as { id: string; slug: string };
  const r = await ponerDueno(supabase, negocio, d);
  if (r.error) {
    // Alta a medias: se deshace para poder repetirla con el mismo código.
    await supabase.rpc("plataforma_borrar_negocio", { p_negocio: negocio.id });
    volver(r.error);
  }
  volver(null, `Negocio «${campo(d, "nombre")}» creado. ${r.bien}`);
}

export async function agregarDueno(d: FormData) {
  const supabase = await soloPlataforma();
  const r = await ponerDueno(supabase, { id: campo(d, "negocio"), slug: campo(d, "slug") }, d);
  volver(r.error ?? null, r.bien ?? "");
}

export async function cambiarPlan(d: FormData) {
  const supabase = await supabaseServidor();
  const plan = campo(d, "plan");
  const { error } = await supabase.rpc("plataforma_cambiar_plan", { p_negocio: campo(d, "negocio"), p_plan: plan });
  volver(error, plan === "suspendido" ? "Negocio suspendido: sus verificadores dejan de mostrar precios en su próxima revisión."
    : "Plan guardado. Si estaba suspendido, ya volvió a funcionar.");
}
