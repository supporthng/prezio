"use server";

import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/util";

export async function aceptar(datos: FormData) {
  const token = String(datos.get("token") ?? "");
  const supabase = await supabaseServidor();
  const { data: negocioId, error } = await supabase.rpc("aceptar_invitacion", { p_token: token });
  if (error || !negocioId) redirect(`/invitacion/${token}?error=${encodeURIComponent(mensajeError(error))}`);
  const { data } = await supabase.from("negocios").select("slug, nombre").eq("id", String(negocioId)).single();
  const negocio = data as { slug: string; nombre: string } | null;
  redirect(negocio ? `/n/${negocio.slug}?bien=${encodeURIComponent(`Ya eres parte de ${negocio.nombre}.`)}` : "/negocios");
}
