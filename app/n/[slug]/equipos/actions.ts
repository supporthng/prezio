"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/util";

const campo = (d: FormData, n: string) => String(d.get(n) ?? "").trim();
const volver = (slug: string, error: unknown, bien: string): never => {
  revalidatePath(`/n/${slug}/equipos`);
  redirect(`/n/${slug}/equipos?${error ? "error=" + encodeURIComponent(mensajeError(error as { message?: string })) : "bien=" + encodeURIComponent(bien)}`);
};

export async function vincularEquipo(datos: FormData) {
  const slug = campo(datos, "slug");
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("vincular_equipo", {
    p_codigo: campo(datos, "codigo"), p_sucursal: campo(datos, "sucursal"), p_nombre: campo(datos, "nombre"),
  });
  volver(slug, error, "Equipo vinculado. En unos segundos muestra la pantalla de precios.");
}

export async function cambiarEquipo(datos: FormData) {
  const slug = campo(datos, "slug");
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("cambiar_equipo", {
    p_equipo: campo(datos, "equipo"), p_nombre: campo(datos, "nombre"), p_sucursal: campo(datos, "sucursal") || null,
  });
  volver(slug, error, "Equipo guardado. Toma los cambios en su próxima revisión (máximo 5 minutos).");
}

export async function quitarEquipo(datos: FormData) {
  const slug = campo(datos, "slug");
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("quitar_equipo", { p_equipo: campo(datos, "equipo") });
  volver(slug, error, "Equipo desvinculado. Al conectarse vuelve a pedir un código.");
}
