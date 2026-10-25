"use server";

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { normalizar } from "@/lib/apariencia";
import { mensajeError } from "@/lib/util";

/** Guarda la apariencia (normalizada en el servidor: nada raro llega a la base). */
export async function guardarApariencia(negocioId: string, slug: string, apariencia: unknown, moneda: string) {
  const supabase = await supabaseServidor();
  const m = String(moneda ?? "").trim().slice(0, 6) || "RD$";
  const { error } = await supabase.from("negocios")
    .update({ apariencia: normalizar(apariencia), moneda: m })
    .eq("id", negocioId);
  if (error) return { ok: false, mensaje: mensajeError(error) };
  revalidatePath(`/n/${slug}/apariencia`);
  return { ok: true, mensaje: "Apariencia guardada. Los verificadores la toman al recargar." };
}
