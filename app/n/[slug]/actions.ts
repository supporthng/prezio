"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/util";

function campo(datos: FormData, nombre: string): string {
  const v = datos.get(nombre);
  return typeof v === "string" ? v.trim() : "";
}

export async function invitar(datos: FormData) {
  const slug = campo(datos, "slug");
  const rol = campo(datos, "rol");
  const supabase = await supabaseServidor();
  const { data: token, error } = await supabase.rpc("invitar", {
    p_negocio: campo(datos, "negocio"),
    p_correo: campo(datos, "correo"),
    p_rol: rol,
    p_sucursal: rol === "encargado" ? campo(datos, "sucursal") || null : null,
  });
  if (error) redirect(`/n/${slug}?error=${encodeURIComponent(mensajeError(error))}#equipo`);
  revalidatePath(`/n/${slug}`);
  redirect(`/n/${slug}?invitado=${token}#equipo`);
}

export async function quitarMiembro(datos: FormData) {
  const slug = campo(datos, "slug");
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("quitar_miembro", {
    p_negocio: campo(datos, "negocio"),
    p_usuario: campo(datos, "usuario"),
  });
  if (error) redirect(`/n/${slug}?error=${encodeURIComponent(mensajeError(error))}#equipo`);
  revalidatePath(`/n/${slug}`);
  redirect(`/n/${slug}?bien=${encodeURIComponent("Persona quitada del negocio.")}#equipo`);
}

export async function renombrarSucursal(datos: FormData) {
  const slug = campo(datos, "slug");
  const supabase = await supabaseServidor();
  const { error } = await supabase
    .from("sucursales")
    .update({ nombre: campo(datos, "nombre") })
    .eq("id", campo(datos, "sucursal"));
  if (error) redirect(`/n/${slug}?error=${encodeURIComponent(mensajeError(error))}#sucursales`);
  revalidatePath(`/n/${slug}`);
  redirect(`/n/${slug}?bien=${encodeURIComponent("Nombre guardado.")}#sucursales`);
}

export async function crearSucursal(datos: FormData) {
  const slug = campo(datos, "slug");
  const nombre = campo(datos, "nombre");
  const codigo = nombre
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30) || "sucursal";
  const supabase = await supabaseServidor();
  const { error } = await supabase
    .from("sucursales")
    .insert({ negocio_id: campo(datos, "negocio"), nombre, codigo: codigo.length < 2 ? codigo + "-1" : codigo });
  if (error) redirect(`/n/${slug}?error=${encodeURIComponent(mensajeError(error))}#sucursales`);
  revalidatePath(`/n/${slug}`);
  redirect(`/n/${slug}?bien=${encodeURIComponent(`Sucursal «${nombre}» creada.`)}#sucursales`);
}
