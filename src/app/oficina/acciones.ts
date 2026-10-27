"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { perfilActual } from "@/lib/auth";
import { hoyRD } from "@/lib/formato";
import { supabaseAdmin, supabaseServidor } from "@/lib/supabase/server";
import type { Resultado } from "@/lib/tipos";

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------

async function sesionOficina(soloAdmin = false) {
  const perfil = await perfilActual();
  if (!perfil || perfil.rol === "tecnico" || (soloAdmin && perfil.rol !== "admin")) {
    return { error: soloAdmin ? "Solo el administrador puede hacer esto." : "No tienes permiso." } as const;
  }
  return { perfil, supabase: await supabaseServidor() } as const;
}

const texto = (d: FormData, k: string) => {
  const v = d.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};
const numero = (d: FormData, k: string) => {
  const v = texto(d, k);
  if (v === null) return null;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const marcado = (d: FormData, k: string) => d.get(k) === "on" || d.get(k) === "true";

/** Traduce errores de la base de datos a algo entendible */
function mensaje(error: { message: string; code?: string } | null, porDefecto = "No se pudo guardar.") {
  if (!error) return porDefecto;
  if (error.code === "23505") return "Ya existe un registro con ese nombre.";
  if (error.code === "23503") return "No se puede borrar porque está en uso.";
  if (error.code === "42501") return "No tienes permiso para esto.";
  if (error.code === "P0001") return error.message; // mensajes de nuestras funciones
  return `${porDefecto} (${error.message})`;
}

function refrescar() {
  revalidatePath("/oficina", "layout");
}

// ---------------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------------

export async function salir() {
  const supabase = await supabaseServidor();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------------------------------------------------------------------
// Rutas y visitas
// ---------------------------------------------------------------------

export async function generarVisitas(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const hasta = texto(d, "hasta");
  if (!hasta) return { error: "Indica hasta qué fecha generar." };
  const { data, error } = await s.supabase.rpc("generar_visitas", { p_hasta: hasta });
  if (error) return { error: mensaje(error, "No se pudieron generar las visitas.") };
  refrescar();
  return { ok: data === 0 ? "No había visitas nuevas por crear." : `Se crearon ${data} visitas.` };
}

export async function marcarRealizada(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const { error } = await s.supabase.rpc("marcar_realizada", {
    p_visita: texto(d, "visita"),
    p_notas: texto(d, "notas"),
  });
  if (error) return { error: mensaje(error) };
  refrescar();
  return { ok: "Marcada como realizada." };
}

export async function cancelarVisita(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const motivo = texto(d, "motivo");
  if (!motivo) return { error: "Elige el motivo de la cancelación." };
  const { error } = await s.supabase.rpc("cancelar_visita", {
    p_visita: texto(d, "visita"),
    p_motivo: motivo,
    p_notas: texto(d, "notas"),
  });
  if (error) return { error: mensaje(error) };
  refrescar();
  return { ok: "Cancelada. Quedó en «Por reprogramar»." };
}

/** Devuelve una visita realizada o cancelada a programada (corrección) */
export async function deshacerEstado(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const id = texto(d, "visita");
  const { count } = await s.supabase.from("visitas").select("id", { count: "exact", head: true }).eq("reprograma_a", id);
  if (count) return { error: "Esta visita ya se reprogramó. Borra primero la visita nueva." };
  const { error } = await s.supabase
    .from("visitas")
    .update({
      estado: "programada",
      realizada_en: null,
      cancelada_en: null,
      motivo_cancelacion_id: null,
      actualizado_por: s.perfil.id,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: mensaje(error) };
  refrescar();
  return { ok: "La visita volvió a programada." };
}

export async function cambiarTecnicoVisita(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const { error } = await s.supabase
    .from("visitas")
    .update({ tecnico_id: texto(d, "tecnico"), actualizado_por: s.perfil.id, actualizado_en: new Date().toISOString() })
    .eq("id", texto(d, "visita"));
  if (error) return { error: mensaje(error) };
  refrescar();
  return { ok: "Técnico cambiado." };
}

export async function cambiarFechaVisita(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const fecha = texto(d, "fecha");
  if (!fecha) return { error: "Indica la fecha." };
  const { error } = await s.supabase
    .from("visitas")
    .update({ fecha, origen: "manual", actualizado_por: s.perfil.id, actualizado_en: new Date().toISOString() })
    .eq("id", texto(d, "visita"))
    .eq("estado", "programada");
  if (error) return { error: mensaje(error) };
  refrescar();
  return { ok: "Fecha cambiada." };
}

export async function asignarLote(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const ids = d.getAll("visitas").map(String).filter(Boolean);
  if (!ids.length) return { error: "No hay visitas seleccionadas." };
  const { data, error } = await s.supabase
    .from("visitas")
    .update({ tecnico_id: texto(d, "tecnico"), actualizado_por: s.perfil.id, actualizado_en: new Date().toISOString() })
    .in("id", ids)
    .eq("estado", "programada")
    .select("id");
  if (error) return { error: mensaje(error) };
  refrescar();
  const n = data?.length ?? 0;
  return { ok: `${n} visita(s) asignada(s).${n < ids.length ? ` ${ids.length - n} no se cambiaron porque ya estaban realizadas o canceladas.` : ""}` };
}

export async function moverLote(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const ids = d.getAll("visitas").map(String).filter(Boolean);
  const fecha = texto(d, "fecha");
  if (!ids.length || !fecha) return { error: "Elige las visitas y la fecha." };
  const { data, error } = await s.supabase
    .from("visitas")
    .update({ fecha, origen: "manual", actualizado_por: s.perfil.id, actualizado_en: new Date().toISOString() })
    .in("id", ids)
    .eq("estado", "programada")
    .select("id");
  if (error) return { error: mensaje(error) };
  refrescar();
  return { ok: `${data?.length ?? 0} visita(s) movida(s) al ${fecha.split("-").reverse().join("/")}.` };
}

export async function borrarVisita(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const { error } = await s.supabase.from("visitas").delete().eq("id", texto(d, "visita")).neq("estado", "realizada");
  if (error) return { error: mensaje(error, "No se pudo borrar.") };
  refrescar();
  return { ok: "Visita borrada." };
}

export async function reprogramarVisita(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const fecha = texto(d, "fecha");
  if (!fecha) return { error: "Indica la nueva fecha." };
  const { error } = await s.supabase.rpc("reprogramar_visita", {
    p_visita: texto(d, "visita"),
    p_fecha: fecha,
    p_tecnico: texto(d, "tecnico"),
  });
  if (error) return { error: mensaje(error, "No se pudo reprogramar.") };
  refrescar();
  return { ok: "Reprogramada." };
}

export async function agregarVisita(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const sucursalId = texto(d, "sucursal");
  const fecha = texto(d, "fecha");
  if (!sucursalId || !fecha) return { error: "Elige la sucursal y la fecha." };
  const { data: su } = await s.supabase
    .from("sucursales")
    .select("servicio_id, tecnico_id, precio, servicios(precio_base)")
    .eq("id", sucursalId)
    .single();
  if (!su) return { error: "La sucursal no existe." };
  const servicioId = texto(d, "servicio") ?? su.servicio_id;
  let precio = su.precio as number | null;
  if (servicioId !== su.servicio_id || precio === null) {
    const { data: se } = await s.supabase.from("servicios").select("precio_base").eq("id", servicioId).maybeSingle();
    precio = se?.precio_base ?? null;
  }
  const { error } = await s.supabase.from("visitas").insert({
    sucursal_id: sucursalId,
    servicio_id: servicioId,
    tecnico_id: texto(d, "tecnico") ?? su.tecnico_id,
    fecha,
    precio,
    origen: "manual",
    actualizado_por: s.perfil.id,
  });
  if (error) return { error: mensaje(error) };
  refrescar();
  return { ok: "Visita agregada." };
}

// ---------------------------------------------------------------------
// Agendar un servicio (cliente existente o nuevo)
// ---------------------------------------------------------------------

const FRECUENCIAS: Record<string, { unidad: "dias" | "semanas" | "meses" | "unica"; cada: number }> = {
  unica: { unidad: "unica", cada: 1 },
  semanal: { unidad: "semanas", cada: 1 },
  quincenal: { unidad: "semanas", cada: 2 },
  mensual: { unidad: "meses", cada: 1 },
  bimestral: { unidad: "meses", cada: 2 },
  trimestral: { unidad: "meses", cada: 3 },
  semestral: { unidad: "meses", cada: 6 },
};

export async function agendarServicio(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const fecha = texto(d, "fecha");
  const servicioId = texto(d, "servicio");
  const tecnicoId = texto(d, "tecnico");
  if (!fecha) return { error: "Indica la fecha del servicio." };
  if (!servicioId) return { error: "Elige el servicio." };
  const precio = numero(d, "precio");
  if (Number.isNaN(precio) || (precio !== null && precio < 0)) return { error: "El precio no es válido." };

  if (d.get("modo") === "existente") {
    const sucursalId = texto(d, "sucursal");
    if (!sucursalId) return { error: "Elige el cliente y la sucursal." };
    let precioFinal = precio;
    if (precioFinal === null) {
      const { data: se } = await s.supabase.from("servicios").select("precio_base").eq("id", servicioId).single();
      precioFinal = se?.precio_base ?? null;
    }
    const { error } = await s.supabase.from("visitas").insert({
      sucursal_id: sucursalId,
      servicio_id: servicioId,
      tecnico_id: tecnicoId,
      fecha,
      precio: precioFinal,
      origen: "manual",
      notas_tecnico: null,
      actualizado_por: s.perfil.id,
    });
    if (error) return { error: mensaje(error) };
  } else {
    const nombre = texto(d, "nombre");
    if (!nombre) return { error: "Escribe el nombre del cliente." };
    const f = FRECUENCIAS[texto(d, "frecuencia") ?? "unica"] ?? FRECUENCIAS.unica;
    const { data: cli, error: e1 } = await s.supabase
      .from("clientes")
      .insert({
        nombre,
        razon_social: texto(d, "razon_social"),
        rnc: texto(d, "rnc"),
        telefono: texto(d, "telefono"),
      })
      .select("id")
      .single();
    if (e1) return { error: mensaje(e1) };
    const diaFecha = new Date(`${fecha}T12:00:00Z`);
    const { error: e2 } = await s.supabase.from("sucursales").insert({
      cliente_id: cli.id,
      nombre: texto(d, "lugar") ?? "Principal",
      direccion: texto(d, "direccion"),
      zona_id: texto(d, "zona"),
      contacto_nombre: texto(d, "contacto") ?? nombre,
      contacto_whatsapp: texto(d, "whatsapp") ?? texto(d, "telefono"),
      servicio_id: servicioId,
      precio,
      frecuencia_unidad: f.unidad,
      frecuencia_cada: f.cada,
      dia_mes: f.unidad === "meses" ? diaFecha.getUTCDate() : null,
      dia_semana: f.unidad === "semanas" ? diaFecha.getUTCDay() || 7 : null,
      fecha_inicio: fecha,
      tecnico_id: tecnicoId,
      notas: texto(d, "notas"),
    });
    if (e2) {
      await s.supabase.from("clientes").delete().eq("id", cli.id);
      return { error: mensaje(e2) };
    }
    const [a, m] = hoyRD().split("-").map(Number);
    const fin = new Date(Date.UTC(a, m + 1, 0)).toISOString().slice(0, 10);
    const { error: e3 } = await s.supabase.rpc("generar_visitas", { p_hasta: fecha > fin ? fecha : fin });
    if (e3) return { error: mensaje(e3, "El cliente se creó, pero no se pudo programar.") };
  }
  refrescar();
  redirect(`/oficina/rutas?desde=${fecha}&hasta=${fecha}`);
}

// ---------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------

function datosCliente(d: FormData) {
  return {
    nombre: texto(d, "nombre"),
    razon_social: texto(d, "razon_social"),
    rnc: texto(d, "rnc"),
    telefono: texto(d, "telefono"),
    correo: texto(d, "correo"),
    notas: texto(d, "notas"),
  };
}

export async function crearCliente(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const datos = datosCliente(d);
  if (!datos.nombre) return { error: "El nombre es obligatorio." };
  const { data, error } = await s.supabase.from("clientes").insert(datos).select("id").single();
  if (error) return { error: mensaje(error) };
  refrescar();
  redirect(`/oficina/clientes/${data.id}`);
}

export async function editarCliente(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const datos = { ...datosCliente(d), activo: marcado(d, "activo") };
  if (!datos.nombre) return { error: "El nombre es obligatorio." };
  const { error } = await s.supabase.from("clientes").update(datos).eq("id", texto(d, "id"));
  if (error) return { error: mensaje(error) };
  refrescar();
  return { ok: "Cliente guardado." };
}

export async function borrarCliente(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const id = texto(d, "id");
  const { data: sucs } = await s.supabase.from("sucursales").select("id").eq("cliente_id", id);
  const ids = (sucs ?? []).map((x) => x.id);
  if (ids.length) {
    const { count } = await s.supabase
      .from("visitas")
      .select("id", { count: "exact", head: true })
      .in("sucursal_id", ids)
      .eq("estado", "realizada");
    if (count) {
      return { error: "Este cliente tiene servicios realizados. Desactívalo en vez de borrarlo para no perder el historial." };
    }
  }
  const { error } = await s.supabase.from("clientes").delete().eq("id", id);
  if (error) return { error: mensaje(error, "No se pudo borrar.") };
  refrescar();
  redirect("/oficina/clientes");
}

// ---------------------------------------------------------------------
// Sucursales
// ---------------------------------------------------------------------

function datosSucursal(d: FormData) {
  const unidad = (texto(d, "frecuencia_unidad") ?? "meses") as "dias" | "semanas" | "meses" | "unica";
  return {
    nombre: texto(d, "nombre"),
    direccion: texto(d, "direccion"),
    zona_id: texto(d, "zona"),
    contacto_nombre: texto(d, "contacto_nombre"),
    contacto_whatsapp: texto(d, "contacto_whatsapp"),
    servicio_id: texto(d, "servicio"),
    precio: numero(d, "precio"),
    frecuencia_unidad: unidad,
    frecuencia_cada: unidad === "unica" ? 1 : (numero(d, "frecuencia_cada") ?? 1),
    dia_mes: unidad === "meses" ? numero(d, "dia_mes") : null,
    dia_semana: unidad === "semanas" ? numero(d, "dia_semana") : null,
    fecha_inicio: texto(d, "fecha_inicio") ?? hoyRD(),
    tecnico_id: texto(d, "tecnico"),
    notas: texto(d, "notas"),
  };
}

function validarSucursal(x: ReturnType<typeof datosSucursal>): string | null {
  if (!x.nombre) return "El nombre de la sucursal es obligatorio.";
  if (Number.isNaN(x.precio) || (x.precio !== null && x.precio < 0)) return "El precio no es válido.";
  if (!Number.isInteger(x.frecuencia_cada) || x.frecuencia_cada < 1 || x.frecuencia_cada > 365)
    return "La frecuencia debe ser un número entre 1 y 365.";
  if (x.dia_mes !== null && (!Number.isInteger(x.dia_mes) || x.dia_mes < 1 || x.dia_mes > 31))
    return "El día del mes debe estar entre 1 y 31.";
  return null;
}

export async function crearSucursal(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const datos = datosSucursal(d);
  const invalido = validarSucursal(datos);
  if (invalido) return { error: invalido };
  const { error } = await s.supabase.from("sucursales").insert({ ...datos, cliente_id: texto(d, "cliente") });
  if (error) return { error: mensaje(error) };

  // Programarla de una vez, hasta donde ya están generadas las rutas (mínimo, fin del mes siguiente)
  const { data: ultima } = await s.supabase.from("visitas").select("fecha").order("fecha", { ascending: false }).limit(1).maybeSingle();
  const [a, m] = hoyRD().split("-").map(Number);
  const finMesSiguiente = new Date(Date.UTC(a, m + 1, 0)).toISOString().slice(0, 10);
  const hasta = ultima?.fecha && ultima.fecha > finMesSiguiente ? (ultima.fecha as string) : finMesSiguiente;
  const { error: errGen } = await s.supabase.rpc("generar_visitas", { p_hasta: hasta });

  refrescar();
  return {
    ok: errGen
      ? `Sucursal «${datos.nombre}» agregada. Usa «Generar visitas» en Rutas para programarla.`
      : `Sucursal «${datos.nombre}» agregada y programada.`,
  };
}

export async function editarSucursal(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const id = texto(d, "id")!;
  const datos = { ...datosSucursal(d), activa: marcado(d, "activa") };
  const invalido = validarSucursal(datos);
  if (invalido) return { error: invalido };

  const { data: antes } = await s.supabase.from("sucursales").select("*").eq("id", id).single();
  if (!antes) return { error: "La sucursal no existe." };

  const { error } = await s.supabase.from("sucursales").update(datos).eq("id", id);
  if (error) return { error: mensaje(error) };

  const hoy = hoyRD();
  const avisos: string[] = [];

  // Si cambió la frecuencia o la fecha de inicio, se rehacen las visitas futuras
  const cambioFrecuencia =
    antes.frecuencia_unidad !== datos.frecuencia_unidad ||
    antes.frecuencia_cada !== datos.frecuencia_cada ||
    (antes.dia_mes ?? null) !== (datos.dia_mes ?? null) ||
    (antes.dia_semana ?? null) !== (datos.dia_semana ?? null) ||
    antes.fecha_inicio !== datos.fecha_inicio;

  if (cambioFrecuencia || !datos.activa) {
    const { data: futuras } = await s.supabase
      .from("visitas")
      .delete()
      .eq("sucursal_id", id)
      .eq("estado", "programada")
      .eq("origen", "frecuencia")
      .gte("fecha", hoy)
      .select("fecha");
    const horizonte = (futuras ?? []).map((v) => v.fecha as string).sort().at(-1);
    if (!datos.activa) {
      if (futuras?.length) avisos.push(`Se quitaron ${futuras.length} visitas futuras.`);
    } else if (horizonte) {
      await s.supabase.rpc("generar_visitas", { p_hasta: horizonte });
      avisos.push("Las visitas futuras se recalcularon con la nueva frecuencia.");
    }
  }

  // Técnico, servicio y precio nuevos se aplican a las visitas futuras pendientes
  if (datos.activa && (antes.tecnico_id !== datos.tecnico_id || antes.servicio_id !== datos.servicio_id || antes.precio !== datos.precio)) {
    let precio = datos.precio;
    if (precio === null && datos.servicio_id) {
      const { data: se } = await s.supabase.from("servicios").select("precio_base").eq("id", datos.servicio_id).single();
      precio = se?.precio_base ?? null;
    }
    await s.supabase
      .from("visitas")
      .update({ tecnico_id: datos.tecnico_id, servicio_id: datos.servicio_id, precio })
      .eq("sucursal_id", id)
      .eq("estado", "programada")
      .gte("fecha", hoy);
    avisos.push("Las visitas pendientes se actualizaron.");
  }

  refrescar();
  return { ok: ["Sucursal guardada.", ...avisos].join(" ") };
}

export async function borrarSucursal(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const id = texto(d, "id");
  const { count } = await s.supabase
    .from("visitas")
    .select("id", { count: "exact", head: true })
    .eq("sucursal_id", id)
    .eq("estado", "realizada");
  if (count) return { error: "Esta sucursal tiene servicios realizados. Desactívala en vez de borrarla." };
  const { error } = await s.supabase.from("sucursales").delete().eq("id", id);
  if (error) return { error: mensaje(error, "No se pudo borrar.") };
  refrescar();
  redirect(`/oficina/clientes/${texto(d, "cliente")}`);
}

// ---------------------------------------------------------------------
// Ajustes: servicios, regiones, zonas, motivos
// ---------------------------------------------------------------------

function datosServicio(d: FormData) {
  return {
    nombre: texto(d, "nombre"),
    precio_base: numero(d, "precio_base") ?? 0,
    garantia_meses: numero(d, "garantia_meses"),
    instrucciones: texto(d, "instrucciones"),
  };
}

function validarServicio(x: ReturnType<typeof datosServicio>) {
  if (!x.nombre) return "El nombre es obligatorio.";
  if (Number.isNaN(x.precio_base) || x.precio_base < 0) return "El precio no es válido.";
  if (x.garantia_meses !== null && (!Number.isInteger(x.garantia_meses) || x.garantia_meses < 1))
    return "La garantía debe ser un número entero de meses (o déjala vacía).";
  return null;
}

export async function crearServicio(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const datos = datosServicio(d);
  const invalido = validarServicio(datos);
  if (invalido) return { error: invalido };
  const { error } = await s.supabase.from("servicios").insert(datos);
  if (error) return { error: mensaje(error) };
  refrescar();
  return { ok: "Servicio agregado." };
}

export async function editarServicio(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const datos = { ...datosServicio(d), activo: marcado(d, "activo") };
  const invalido = validarServicio(datos);
  if (invalido) return { error: invalido };
  const { error } = await s.supabase.from("servicios").update(datos).eq("id", texto(d, "id"));
  if (error) return { error: mensaje(error) };
  refrescar();
  return { ok: "Servicio guardado." };
}

export async function crearRegion(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const nombre = texto(d, "nombre");
  if (!nombre) return { error: "Escribe el nombre." };
  const { error } = await s.supabase.from("regiones").insert({ nombre });
  if (error) return { error: mensaje(error) };
  refrescar();
  return { ok: "Región agregada." };
}

export async function borrarRegion(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const id = texto(d, "id");
  const { data: zs } = await s.supabase.from("zonas").select("id").eq("region_id", id);
  if (zs?.length) {
    const { count } = await s.supabase
      .from("sucursales")
      .select("id", { count: "exact", head: true })
      .in("zona_id", zs.map((z) => z.id));
    if (count) return { error: "Hay sucursales en zonas de esta región. Cámbialas primero." };
  }
  const { error } = await s.supabase.from("regiones").delete().eq("id", id);
  if (error) return { error: mensaje(error, "No se pudo borrar.") };
  refrescar();
  return { ok: "Región borrada." };
}

export async function crearZona(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const nombre = texto(d, "nombre");
  if (!nombre) return { error: "Escribe el nombre de la zona." };
  const { error } = await s.supabase.from("zonas").insert({ nombre, region_id: texto(d, "region") });
  if (error) return { error: mensaje(error) };
  refrescar();
  return { ok: "Zona agregada." };
}

export async function borrarZona(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const id = texto(d, "id");
  const { count } = await s.supabase.from("sucursales").select("id", { count: "exact", head: true }).eq("zona_id", id);
  if (count) return { error: `Hay ${count} sucursal(es) en esta zona. Cámbialas primero.` };
  const { error } = await s.supabase.from("zonas").delete().eq("id", id);
  if (error) return { error: mensaje(error, "No se pudo borrar.") };
  refrescar();
  return { ok: "Zona borrada." };
}

export async function crearMotivo(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const nombre = texto(d, "nombre");
  if (!nombre) return { error: "Escribe el motivo." };
  const { error } = await s.supabase.from("motivos_cancelacion").insert({ nombre });
  if (error) return { error: mensaje(error) };
  refrescar();
  return { ok: "Motivo agregado." };
}

export async function alternarMotivo(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const { error } = await s.supabase
    .from("motivos_cancelacion")
    .update({ activo: d.get("activo") === "true" })
    .eq("id", texto(d, "id"));
  if (error) return { error: mensaje(error) };
  refrescar();
  return { ok: "Listo." };
}

// ---------------------------------------------------------------------
// Empresa y productos (constancia de servicio)
// ---------------------------------------------------------------------

export async function guardarEmpresa(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const nombre = texto(d, "nombre");
  if (!nombre) return { error: "El nombre de la empresa es obligatorio." };
  const { error } = await s.supabase
    .from("empresa")
    .update({
      nombre,
      rnc: texto(d, "rnc"),
      telefono: texto(d, "telefono"),
      whatsapp: texto(d, "whatsapp"),
      correo: texto(d, "correo"),
      direccion: texto(d, "direccion"),
      licencia: texto(d, "licencia"),
      pie_constancia: texto(d, "pie_constancia"),
      mensaje_ticket: texto(d, "mensaje_ticket"),
      bloquear_credito: d.get("bloquear_credito") === "on",
    })
    .eq("id", 1);
  if (error) return { error: mensaje(error) };
  refrescar();
  return { ok: "Datos de la empresa guardados." };
}

function datosProducto(d: FormData) {
  return {
    nombre: texto(d, "nombre"),
    ingrediente_activo: texto(d, "ingrediente_activo"),
    unidad: texto(d, "unidad") ?? "ml",
    registro: texto(d, "registro"),
  };
}

export async function crearProducto(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const datos = datosProducto(d);
  if (!datos.nombre) return { error: "El nombre es obligatorio." };
  const { error } = await s.supabase.from("productos").insert(datos);
  if (error) return { error: mensaje(error) };
  refrescar();
  return { ok: "Producto agregado." };
}

export async function editarProducto(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina();
  if ("error" in s) return { error: s.error };
  const datos = { ...datosProducto(d), activo: marcado(d, "activo") };
  if (!datos.nombre) return { error: "El nombre es obligatorio." };
  const { error } = await s.supabase.from("productos").update(datos).eq("id", texto(d, "id"));
  if (error) return { error: mensaje(error) };
  refrescar();
  return { ok: "Producto guardado." };
}

// ---------------------------------------------------------------------
// Usuarios (solo admin)
// ---------------------------------------------------------------------

export async function crearUsuario(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina(true);
  if ("error" in s) return { error: s.error };
  const admin = supabaseAdmin();
  if (!admin) {
    return {
      error:
        "Falta la variable SUPABASE_SERVICE_ROLE_KEY en Vercel. Mientras tanto, crea el usuario en Supabase → Authentication → Users.",
    };
  }
  const correo = texto(d, "correo");
  const clave = texto(d, "clave");
  const nombre = texto(d, "nombre");
  const rol = texto(d, "rol") ?? "tecnico";
  if (!correo || !clave || !nombre) return { error: "Nombre, correo y contraseña son obligatorios." };
  if (clave.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };
  if (!["admin", "oficina", "tecnico"].includes(rol)) return { error: "Rol no válido." };

  const { error } = await admin.auth.admin.createUser({
    email: correo,
    password: clave,
    email_confirm: true,
    user_metadata: { nombre, rol, telefono: texto(d, "telefono") },
  });
  if (error) {
    return {
      error: /already|registered|exists/i.test(error.message)
        ? "Ya existe un usuario con ese correo."
        : `No se pudo crear el usuario (${error.message}).`,
    };
  }
  refrescar();
  return { ok: `Usuario creado. Entra con ${correo} y la contraseña que pusiste.` };
}

export async function editarUsuario(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesionOficina(true);
  if ("error" in s) return { error: s.error };
  const id = texto(d, "id");
  const rol = texto(d, "rol");
  const activo = marcado(d, "activo");
  if (id === s.perfil.id && (rol !== "admin" || !activo)) {
    return { error: "No puedes quitarte a ti mismo el rol de administrador ni desactivarte." };
  }
  const { error } = await s.supabase
    .from("perfiles")
    .update({ nombre: texto(d, "nombre"), telefono: texto(d, "telefono"), rol, activo })
    .eq("id", id);
  if (error) return { error: mensaje(error) };
  refrescar();
  return { ok: "Usuario guardado." };
}
