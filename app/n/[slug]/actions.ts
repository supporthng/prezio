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
  if (error) redirect(`/n/${slug}/sucursales?error=${encodeURIComponent(mensajeError(error))}`);
  revalidatePath(`/n/${slug}/sucursales`);
  redirect(`/n/${slug}/sucursales?bien=${encodeURIComponent("Nombre guardado.")}`);
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
  if (error) redirect(`/n/${slug}/sucursales?error=${encodeURIComponent(mensajeError(error))}`);
  revalidatePath(`/n/${slug}/sucursales`);
  redirect(`/n/${slug}/sucursales?bien=${encodeURIComponent(`Sucursal «${nombre}» creada.`)}`);
}

export async function cambiarFuente(datos: FormData) {
  const slug = campo(datos, "slug");
  const inventario = campo(datos, "fuente");
  const supabase = await supabaseServidor();
  const { error } = await supabase
    .from("sucursales")
    .update({ fuente: inventario ? { tipo: "inventario", inventario_id: inventario } : {} })
    .eq("id", campo(datos, "sucursal"));
  if (error) redirect(`/n/${slug}/sucursales?error=${encodeURIComponent(mensajeError(error))}`);
  revalidatePath(`/n/${slug}/sucursales`);
  redirect(`/n/${slug}/sucursales?bien=${encodeURIComponent("Fuente de precios guardada.")}`);
}

export async function guardarUbicacion(datos: FormData) {
  const slug = campo(datos, "slug");
  const lat = campo(datos, "latitud"), lon = campo(datos, "longitud");
  const latitud = lat === "" ? null : Number(lat), longitud = lon === "" ? null : Number(lon);
  const radio = Math.min(10000, Math.max(10, Math.round(Number(campo(datos, "radio_m")) || 100)));
  const activa = datos.get("geo_activa") === "on";
  const malas = (latitud === null) !== (longitud === null) || (latitud !== null && (!Number.isFinite(latitud) || Math.abs(latitud) > 90))
    || (longitud !== null && (!Number.isFinite(longitud) || Math.abs(longitud) > 180));
  if (malas || (activa && latitud === null)) {
    redirect(`/n/${slug}/sucursales?error=${encodeURIComponent("Ubicación incompleta o no válida.")}`);
  }
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("sucursales")
    .update({ latitud, longitud, radio_m: radio, geo_activa: activa && latitud !== null })
    .eq("id", campo(datos, "sucursal"));
  if (error) redirect(`/n/${slug}/sucursales?error=${encodeURIComponent(mensajeError(error))}`);
  revalidatePath(`/n/${slug}/sucursales`);
  redirect(`/n/${slug}/sucursales?bien=${encodeURIComponent("Ubicación guardada.")}`);
}

/** Activar o apagar la consulta desde el celular de los clientes (casilla «Apariencia»; la base lo decide). */
export async function cambiarConsultaMovil(datos: FormData) {
  const slug = campo(datos, "slug");
  const activa = campo(datos, "activa") === "si";
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.from("negocios").update({ consulta_movil: activa }).eq("id", campo(datos, "negocio")).select("id");
  if (error || !data?.length) redirect(`/n/${slug}/sucursales?error=${encodeURIComponent(error ? mensajeError(error) : "Activarla requiere la casilla «Apariencia».")}`);
  revalidatePath(`/n/${slug}/sucursales`);
  redirect(`/n/${slug}/sucursales?bien=${encodeURIComponent(activa ? "Consulta desde el celular activada: comparte el enlace o el QR de cada sucursal." : "Consulta desde el celular apagada.")}`)
}
