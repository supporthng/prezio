"use server";

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { normalizar } from "@/lib/apariencia";
import { mensajeError } from "@/lib/util";

/** Guarda la apariencia (normalizada en el servidor: nada raro llega a la base). */
export async function guardarApariencia(negocioId: string, slug: string, apariencia: unknown, moneda: string) {
  const supabase = await supabaseServidor();
  const m = String(moneda ?? "").trim().slice(0, 6) || "RD$";
  const { data, error } = await supabase.from("negocios")
    .update({ apariencia: normalizar(apariencia), moneda: m })
    .eq("id", negocioId).select("id");
  if (error) return { ok: false, mensaje: mensajeError(error) };
  if (!data?.length) return { ok: false, mensaje: "No se guardó: tu usuario no tiene la casilla «Apariencia»." };
  revalidatePath(`/n/${slug}/apariencia`);
  return { ok: true, mensaje: "Apariencia guardada. Los verificadores la toman al recargar." };
}

/** Guarda al momento el logo o el QR recién subido (sin tocar el resto de la apariencia) y lo deja visible. */
export async function guardarImagen(negocioId: string, slug: string, cual: "logo" | "qr", url: string | null) {
  const supabase = await supabaseServidor();
  const { data: neg, error: e1 } = await supabase.from("negocios").select("apariencia").eq("id", negocioId).maybeSingle();
  if (e1 || !neg) return { ok: false, mensaje: e1 ? mensajeError(e1) : "No se encontró el negocio." };
  const actual = (neg as { apariencia: Record<string, unknown> }).apariencia ?? {};
  const visible = cual === "logo" ? "mostrar_logo" : "mostrar_qr";
  const nueva = normalizar({ ...actual, [cual]: url, ...(url ? { [visible]: true } : {}) });
  const { data, error } = await supabase.from("negocios").update({ apariencia: nueva }).eq("id", negocioId).select("id");
  if (error) return { ok: false, mensaje: mensajeError(error) };
  if (!data?.length) return { ok: false, mensaje: "No se guardó: tu usuario no tiene la casilla «Apariencia»." };
  revalidatePath(`/n/${slug}/apariencia`);
  revalidatePath(`/n/${slug}/sucursales`);
  return { ok: true, mensaje: url
    ? (cual === "logo" ? "Logo guardado. Ya sale en los verificadores y en la consulta del celular (los equipos lo toman en su próxima revisión)." : "QR guardado.")
    : (cual === "logo" ? "Logo quitado." : "QR quitado.") };
}
