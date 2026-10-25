"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/util";
import {
  FRECUENCIAS, columnasDe, descargarGoogle, enviarEnPartes, nombresDeColumnas, productosDeGoogle,
  type ColumnasGuardadas, type OrigenGoogle,
} from "@/lib/fuentes";
import { productos } from "@/lib/hoja";

const campo = (d: FormData, n: string) => String(d.get(n) ?? "").trim();
const frecuencia = (v: unknown) => FRECUENCIAS.some((f) => f.min === Number(v)) ? Number(v) : 60;

export type Revision =
  | { ok: true; encabezados: string[]; muestra: string[][]; columnas: ColumnasGuardadas; validos: number; descartados: number }
  | { ok: false; error: string };

/** Lee la hoja y propone las columnas, para revisar antes de crear el inventario. */
export async function revisarGoogle(url: string): Promise<Revision> {
  const { data: auth } = await (await supabaseServidor()).auth.getUser();
  if (!auth.user) return { ok: false, error: "Vuelve a entrar a Prezio." };
  try {
    const filas = await descargarGoogle(url);
    if (!filas.length) return { ok: false, error: "La hoja está vacía." };
    const c = columnasDe(filas);
    const r = productos(filas, c);
    return {
      ok: true,
      encabezados: (filas[c.encabezado] ?? []).map((t, i) => t || `Columna ${i + 1}`),
      muestra: filas.slice(c.encabezado + 1, c.encabezado + 6),
      columnas: nombresDeColumnas(filas, c),
      validos: r.lista.length,
      descartados: r.descartados,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo leer la hoja." };
  }
}

type Supabase = Awaited<ReturnType<typeof supabaseServidor>>;

/** Descarga la hoja y la guarda con la sesión del usuario (solo dueño o admin, lo decide la base). */
async function cargarDesdeGoogle(supabase: Supabase, inventario: string, origen: OrigenGoogle): Promise<number> {
  try {
    const lista = await productosDeGoogle(origen);
    return await enviarEnPartes(lista, async (lote, parte, fin) => {
      const { data, error } = await supabase.rpc("cargar_inventario", {
        p_inventario: inventario, p_lote: lote, p_productos: parte, p_fin: fin,
      });
      if (error) throw new Error(mensajeError(error));
      return Number(data) || 0;
    });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error";
    await supabase.rpc("cargar_inventario", {
      p_inventario: inventario, p_lote: null, p_productos: null, p_fin: false, p_error: mensaje,
    });
    throw e;
  }
}

export async function crearGoogle(datos: {
  negocioId: string; slug: string; nombre: string; url: string; columnas: ColumnasGuardadas; cada_min: number;
}): Promise<{ ok: true; productos: number } | { ok: false; error: string }> {
  const supabase = await supabaseServidor();
  const origen: OrigenGoogle = { tipo: "google", url: datos.url.trim(), columnas: datos.columnas, cada_min: frecuencia(datos.cada_min) };
  const { data, error } = await supabase.from("inventarios")
    .insert({ negocio_id: datos.negocioId, nombre: datos.nombre.trim(), origen }).select("id").single();
  if (error) return { ok: false, error: mensajeError(error) };
  const id = (data as { id: string }).id;
  try {
    const n = await cargarDesdeGoogle(supabase, id, origen);
    revalidatePath(`/n/${datos.slug}/inventarios`);
    return { ok: true, productos: n };
  } catch (e) {
    revalidatePath(`/n/${datos.slug}/inventarios`);
    return { ok: false, error: `El inventario se creó, pero no se pudo cargar: ${e instanceof Error ? e.message : "error"}` };
  }
}

export async function actualizarGoogle(datos: FormData) {
  const slug = campo(datos, "slug");
  const id = campo(datos, "inventario");
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("inventarios").select("nombre, origen").eq("id", id).maybeSingle();
  const inv = data as { nombre: string; origen: OrigenGoogle } | null;
  let destino: string;
  if (!inv || inv.origen?.tipo !== "google") destino = "error=" + encodeURIComponent("Ese inventario no es de Google.");
  else {
    try {
      const n = await cargarDesdeGoogle(supabase, id, inv.origen);
      destino = "bien=" + encodeURIComponent(`«${inv.nombre}» actualizado: ${n.toLocaleString("es-DO")} productos.`);
    } catch (e) {
      destino = "error=" + encodeURIComponent(e instanceof Error ? e.message : "No se pudo actualizar.");
    }
  }
  revalidatePath(`/n/${slug}/inventarios`);
  redirect(`/n/${slug}/inventarios?${destino}`);
}

/** Cambiar el enlace o cada cuánto se actualiza (las columnas se vuelven a buscar por nombre). */
export async function ajustarGoogle(datos: FormData) {
  const slug = campo(datos, "slug");
  const id = campo(datos, "inventario");
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("inventarios").select("origen").eq("id", id).maybeSingle();
  const actual = (data as { origen: OrigenGoogle } | null)?.origen;
  let destino: string;
  if (actual?.tipo !== "google") destino = "error=" + encodeURIComponent("Ese inventario no es de Google.");
  else {
    const url = campo(datos, "url") || actual.url;
    let columnas = actual.columnas;
    let error = "";
    if (url !== actual.url) {
      // Hoja nueva: se revisa que se pueda leer y se toman sus columnas.
      try {
        const filas = await descargarGoogle(url);
        try { columnasDe(filas, columnas); } catch { columnas = nombresDeColumnas(filas, columnasDe(filas)); }
      } catch (e) { error = e instanceof Error ? e.message : "No se pudo leer la hoja nueva."; }
    }
    if (error) destino = "error=" + encodeURIComponent(error);
    else {
      const origen: OrigenGoogle = { tipo: "google", url, columnas, cada_min: frecuencia(campo(datos, "cada_min")) };
      const { error: e } = await supabase.from("inventarios").update({ origen }).eq("id", id);
      destino = e ? "error=" + encodeURIComponent(mensajeError(e)) : "bien=" + encodeURIComponent("Ajustes guardados.");
    }
  }
  revalidatePath(`/n/${slug}/inventarios`);
  redirect(`/n/${slug}/inventarios?${destino}`);
}

// ---------------------------------------------------------------- conectores
export async function crearConector(negocioId: string, slug: string, nombre: string):
  Promise<{ ok: true; clave: string } | { ok: false; error: string }> {
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.rpc("crear_conector", { p_negocio: negocioId, p_nombre: nombre });
  if (error) return { ok: false, error: mensajeError(error) };
  revalidatePath(`/n/${slug}/inventarios`);
  return { ok: true, clave: String(data) };
}

export async function quitarConector(datos: FormData) {
  const slug = campo(datos, "slug");
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("quitar_conector", { p_conector: campo(datos, "conector") });
  revalidatePath(`/n/${slug}/inventarios`);
  redirect(`/n/${slug}/inventarios?${error ? "error=" + encodeURIComponent(mensajeError(error)) : "bien=" + encodeURIComponent("Conector quitado: su clave ya no sirve.")}`);
}

export async function crearInventarioConector(datos: FormData) {
  const slug = campo(datos, "slug");
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("inventarios").insert({
    negocio_id: campo(datos, "negocio"), nombre: campo(datos, "nombre"),
    origen: { tipo: "conector", conector_id: campo(datos, "conector") },
  });
  revalidatePath(`/n/${slug}/inventarios`);
  redirect(`/n/${slug}/inventarios?${error ? "error=" + encodeURIComponent(mensajeError(error)) : "bien=" + encodeURIComponent("Inventario creado. El conector lo llenará en su próxima vuelta.")}`);
}
