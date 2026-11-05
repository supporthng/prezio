"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/util";

const campo = (d: FormData, n: string) => String(d.get(n) ?? "").trim();
const volver = (slug: string, error: unknown, bien: string): never => {
  revalidatePath(`/n/${slug}/ofertas`);
  redirect(`/n/${slug}/ofertas?${error ? "error=" + encodeURIComponent(typeof error === "string" ? error : mensajeError(error as { message?: string })) : "bien=" + encodeURIComponent(bien)}`);
};

/** «7501055363063 99.50» o «7501055363063;99,50» → {codigo, precio} (una línea por producto). */
function productosDe(texto: string) {
  return texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [codigo, ...resto] = l.split(/[\s;,\t]+/);
    const p = resto.join("").replace(",", ".");
    return { codigo: codigo.slice(0, 64), precio: p && Number.isFinite(Number(p)) ? p : "" };
  });
}

/** Fecha local (del formulario, hora del negocio) a ISO con la zona del negocio (UTC−4). */
const fecha = (v: string, fin = false) => (v ? `${v}T${fin ? "23:59:59" : "00:00:00"}-04:00` : "");

export async function guardarOferta(d: FormData) {
  const slug = campo(d, "slug");
  const tipo = campo(d, "tipo");
  const oferta = {
    id: campo(d, "id"), nombre: campo(d, "nombre"), descripcion: campo(d, "descripcion"), tipo,
    valor: campo(d, "valor"), lleva: campo(d, "lleva"), paga: campo(d, "paga"), imagen: campo(d, "imagen"),
    sucursales: d.getAll("sucursales").map(String), dias: d.getAll("dias").map(String),
    desde: fecha(campo(d, "desde")), hasta: fecha(campo(d, "hasta"), true),
    hora_desde: campo(d, "hora_desde"), hora_hasta: campo(d, "hora_hasta"),
    activa: d.get("activa") === "on", orden: campo(d, "orden"),
    productos: tipo === "aviso" ? [] : productosDe(campo(d, "productos")),
  };
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.rpc("guardar_oferta", { p_negocio: campo(d, "negocio"), p: oferta });
  const sin = ((data as { sin_encontrar?: string[] } | null)?.sin_encontrar ?? []);
  volver(slug, error, `Oferta «${oferta.nombre}» guardada. Los verificadores la muestran en unos minutos.` +
    (sin.length ? ` Ojo: ${sin.length === 1 ? "el código" : "los códigos"} ${sin.slice(0, 6).join(", ")}${sin.length > 6 ? "…" : ""} no ${sin.length === 1 ? "está" : "están"} en ningún inventario.` : ""));
}

export async function pausarOferta(d: FormData) {
  const slug = campo(d, "slug");
  const activa = campo(d, "activa") === "1";
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("pausar_oferta", { p_oferta: campo(d, "id"), p_activa: activa });
  volver(slug, error, activa ? "Oferta activada." : "Oferta pausada: ya no se muestra.");
}

export async function borrarOferta(d: FormData) {
  const slug = campo(d, "slug");
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("borrar_oferta", { p_oferta: campo(d, "id") });
  volver(slug, error, "Oferta borrada.");
}
