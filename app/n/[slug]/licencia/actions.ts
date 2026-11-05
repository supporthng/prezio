"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/util";

const campo = (d: FormData, n: string) => String(d.get(n) ?? "").trim();
const volver = (slug: string, error: unknown, bien: string): never => {
  revalidatePath(`/n/${slug}/licencia`);
  redirect(`/n/${slug}/licencia?${error ? "error=" + encodeURIComponent(mensajeError(error as { message?: string })) : "bien=" + encodeURIComponent(bien)}`);
};

export async function solicitarPlan(d: FormData) {
  const slug = campo(d, "slug");
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("solicitar_plan", {
    p_negocio: campo(d, "negocio"), p_plan: campo(d, "plan"), p_meses: Number(campo(d, "meses")) || 1,
    p_contacto: campo(d, "contacto"), p_telefono: campo(d, "telefono"), p_correo: campo(d, "correo") || null,
    p_mensaje: campo(d, "mensaje") || null, p_origen: campo(d, "origen") === "app" ? "app" : "panel",
  });
  volver(slug, error, "Solicitud enviada. Tu proveedor se comunicará contigo para confirmar el pago y activar el plan.");
}

export async function cancelarSolicitud(d: FormData) {
  const slug = campo(d, "slug");
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("cancelar_solicitud", { p_negocio: campo(d, "negocio") });
  volver(slug, error, "Solicitud cancelada.");
}
