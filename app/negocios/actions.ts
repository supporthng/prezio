"use server";

import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/util";

export async function crearNegocio(datos: FormData) {
  const nombre = String(datos.get("nombre") ?? "").trim();
  const supabase = await supabaseServidor();
  const { data: id, error } = await supabase.rpc("crear_negocio", { p_nombre: nombre });
  if (error || !id) redirect(`/negocios/nuevo?error=${encodeURIComponent(mensajeError(error))}`);
  const { data: negocio } = await supabase.from("negocios").select("slug").eq("id", id).single();
  redirect(negocio ? `/n/${negocio.slug}?bien=${encodeURIComponent("Negocio creado. Ya tienes tu sucursal Principal.")}` : "/negocios");
}
