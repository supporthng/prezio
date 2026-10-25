"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/util";

const campo = (d: FormData, n: string) => String(d.get(n) ?? "").trim();

export async function renombrarInventario(datos: FormData) {
  const slug = campo(datos, "slug");
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("inventarios").update({ nombre: campo(datos, "nombre") }).eq("id", campo(datos, "inventario"));
  revalidatePath(`/n/${slug}/inventarios`);
  redirect(`/n/${slug}/inventarios?${error ? "error=" + encodeURIComponent(mensajeError(error)) : "bien=" + encodeURIComponent("Nombre guardado.")}`);
}

export async function eliminarInventario(datos: FormData) {
  const slug = campo(datos, "slug");
  const id = campo(datos, "inventario");
  const supabase = await supabaseServidor();
  // No se borra si alguna sucursal lo usa (se quedaría sin precios).
  const { data: usan } = await supabase.from("sucursales").select("nombre").eq("fuente->>inventario_id", id);
  if (usan && usan.length) {
    redirect(`/n/${slug}/inventarios?error=${encodeURIComponent("Lo usan: " + (usan as { nombre: string }[]).map((s) => s.nombre).join(", ") + ". Cámbiales la fuente antes de eliminarlo.")}`);
  }
  const { error } = await supabase.from("inventarios").delete().eq("id", id);
  revalidatePath(`/n/${slug}/inventarios`);
  redirect(`/n/${slug}/inventarios?${error ? "error=" + encodeURIComponent(mensajeError(error)) : "bien=" + encodeURIComponent("Inventario eliminado.")}`);
}
