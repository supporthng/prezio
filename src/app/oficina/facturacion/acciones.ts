"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { perfilActual } from "@/lib/auth";
import { supabaseServidor } from "@/lib/supabase/server";
import type { LineaFactura, Resultado, TipoDocumento } from "@/lib/tipos";

async function sesion() {
  const perfil = await perfilActual();
  if (!perfil || perfil.rol === "tecnico") return { error: "No tienes permiso." } as const;
  return { perfil, supabase: await supabaseServidor() } as const;
}

const texto = (d: FormData, k: string) => {
  const v = d.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

function mensaje(error: { message: string; code?: string } | null, porDefecto = "No se pudo guardar.") {
  if (!error) return porDefecto;
  if (error.code === "P0001") return error.message;
  if (error.code === "23505") return "Ese número ya existe.";
  if (error.code === "42501") return "No tienes permiso para esto.";
  return `${porDefecto} (${error.message})`;
}

function refrescar() {
  revalidatePath("/oficina", "layout");
}

const ir = (id: string, error?: string) => redirect(`/oficina/facturacion/${id}${error ? `?error=${encodeURIComponent(error)}` : ""}`);

// ---------------------------------------------------------------------
// Guardar (y opcionalmente emitir) un documento
// ---------------------------------------------------------------------

type Datos = {
  id?: string | null;
  tipo_doc: TipoDocumento;
  tipo_ncf: string | null;
  cliente_id: string;
  fecha: string;
  dias_credito: number;
  notas: string | null;
  referencia_id?: string | null;
  reembolso?: string;
  devuelve_inventario?: boolean;
  moneda?: string;
  tasa_cambio?: number;
  lineas: LineaFactura[];
};

function validar(x: Datos): string | null {
  if (!x.cliente_id) return "Elige el cliente.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x.fecha)) return "La fecha no es válida.";
  if (x.tipo_doc !== "proforma" && !x.tipo_ncf) return "Elige el tipo de comprobante.";
  if (!Number.isInteger(x.dias_credito) || x.dias_credito < 0 || x.dias_credito > 365) return "Los días de crédito deben estar entre 0 y 365.";
  if (!["DOP", "USD", "EUR", undefined].includes(x.moneda)) return "La moneda no es válida.";
  if (x.moneda && x.moneda !== "DOP" && !(Number(x.tasa_cambio) > 0)) return "Indica la tasa de cambio.";
  for (const [i, l] of x.lineas.entries()) {
    if (!l.descripcion?.trim()) return `La línea ${i + 1} no tiene descripción.`;
    if (!(l.cantidad > 0)) return `La cantidad de la línea ${i + 1} debe ser mayor que cero.`;
    if (!(l.precio >= 0)) return `El precio de la línea ${i + 1} no es válido.`;
    if (!(l.descuento >= 0) || l.descuento > l.cantidad * l.precio) return `El descuento de la línea ${i + 1} no es válido.`;
    if (![0, 16, 18].includes(l.itbis_tasa)) return `El ITBIS de la línea ${i + 1} no es válido.`;
  }
  return null;
}

export async function guardarDocumento(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesion();
  if ("error" in s) return { error: s.error };
  let x: Datos;
  try {
    x = JSON.parse(String(d.get("datos")));
  } catch {
    return { error: "Los datos del documento no son válidos." };
  }
  const emitir = d.get("accion") === "emitir";
  const invalido = validar(x);
  if (invalido) return { error: invalido };
  if (emitir && x.lineas.length === 0) return { error: "Agrega al menos una línea antes de emitir." };

  const cabecera = {
    tipo_doc: x.tipo_doc,
    tipo_ncf: x.tipo_doc === "proforma" ? null : x.tipo_ncf,
    cliente_id: x.cliente_id,
    fecha: x.fecha,
    dias_credito: x.tipo_doc === "factura" ? x.dias_credito : 0,
    notas: x.notas?.trim() || null,
    referencia_id: x.tipo_doc === "nota_credito" ? (x.referencia_id ?? null) : null,
    reembolso: ["saldo", "efectivo", "transferencia", "cheque", "tarjeta"].includes(x.reembolso ?? "") ? x.reembolso : "saldo",
    devuelve_inventario: x.devuelve_inventario !== false,
    ...(x.tipo_doc === "nota_credito"
      ? {}
      : { moneda: x.moneda ?? "DOP", tasa_cambio: !x.moneda || x.moneda === "DOP" ? 1 : Number(x.tasa_cambio) }),
  };

  let id = x.id ?? null;
  if (id) {
    const { data: actual } = await s.supabase.from("facturas").select("estado").eq("id", id).single();
    if (!actual) return { error: "El documento no existe." };
    if (actual.estado !== "borrador") return { error: "Este documento ya fue emitido y no se puede cambiar." };
    const { error } = await s.supabase.from("facturas").update(cabecera).eq("id", id);
    if (error) return { error: mensaje(error) };
    const { error: e2 } = await s.supabase.from("factura_lineas").delete().eq("factura_id", id);
    if (e2) return { error: mensaje(e2) };
  } else {
    const { data, error } = await s.supabase.from("facturas").insert({ ...cabecera, creado_por: s.perfil.id }).select("id").single();
    if (error) return { error: mensaje(error) };
    id = data.id as string;
  }

  if (x.lineas.length) {
    const { error } = await s.supabase.from("factura_lineas").insert(
      x.lineas.map((l, i) => ({
        factura_id: id,
        orden: i + 1,
        descripcion: l.descripcion.trim(),
        servicio_id: l.servicio_id || null,
        producto_id: l.producto_id || null,
        visita_id: l.visita_id || null,
        cantidad: l.cantidad,
        precio: l.precio,
        descuento: l.descuento || 0,
        itbis_tasa: l.itbis_tasa,
      })),
    );
    if (error) {
      refrescar();
      ir(id!, mensaje(error, "No se pudieron guardar las líneas."));
    }
  }

  if (emitir) {
    const { error } = await s.supabase.rpc("emitir_documento", { p_id: id });
    refrescar();
    if (error) ir(id!, mensaje(error, "No se pudo emitir."));
  }
  refrescar();
  ir(id!);
  return null;
}

export async function emitirDocumento(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesion();
  if ("error" in s) return { error: s.error };
  const { error } = await s.supabase.rpc("emitir_documento", { p_id: texto(d, "id") });
  if (error) return { error: mensaje(error, "No se pudo emitir.") };
  refrescar();
  return { ok: "Documento emitido." };
}

export async function anularDocumento(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesion();
  if ("error" in s) return { error: s.error };
  const motivo = texto(d, "motivo");
  if (!motivo) return { error: "Indica el motivo de la anulación." };
  const { error } = await s.supabase.rpc("anular_documento", { p_id: texto(d, "id"), p_motivo: motivo });
  if (error) return { error: mensaje(error, "No se pudo anular.") };
  refrescar();
  return { ok: "Documento anulado. Los servicios que tenía se pueden volver a facturar." };
}

export async function borrarBorrador(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesion();
  if ("error" in s) return { error: s.error };
  const { error } = await s.supabase.from("facturas").delete().eq("id", texto(d, "id")).eq("estado", "borrador");
  if (error) return { error: mensaje(error, "No se pudo borrar.") };
  refrescar();
  redirect("/oficina/facturacion");
}

export async function notaCredito(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesion();
  if ("error" in s) return { error: s.error };
  const { data, error } = await s.supabase.rpc("crear_nota_credito", { p_factura: texto(d, "id") });
  if (error) return { error: mensaje(error, "No se pudo crear la nota de crédito.") };
  refrescar();
  ir(data as string);
  return null;
}

export async function proformaAFactura(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesion();
  if ("error" in s) return { error: s.error };
  const { data, error } = await s.supabase.rpc("proforma_a_factura", { p_proforma: texto(d, "id"), p_tipo_ncf: texto(d, "tipo_ncf") });
  if (error) return { error: mensaje(error, "No se pudo convertir.") };
  refrescar();
  ir(data as string);
  return null;
}

export async function facturarPeriodo(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesion();
  if ("error" in s) return { error: s.error };
  const desde = texto(d, "desde");
  const hasta = texto(d, "hasta");
  const clientes = d.getAll("clientes").map(String).filter(Boolean);
  if (!desde || !hasta) return { error: "Indica el período." };
  if (!clientes.length) return { error: "Marca al menos un cliente." };
  const { data, error } = await s.supabase.rpc("facturar_periodo", { p_desde: desde, p_hasta: hasta, p_clientes: clientes });
  if (error) return { error: mensaje(error, "No se pudieron crear las facturas.") };
  refrescar();
  redirect(`/oficina/facturacion?estado=borrador&creadas=${data}`);
}

// ---------------------------------------------------------------------
// Secuencias de comprobantes
// ---------------------------------------------------------------------

export async function crearSecuencia(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesion();
  if ("error" in s) return { error: s.error };
  const tipo = texto(d, "tipo");
  const leerNumero = (k: string) => {
    const v = texto(d, k);
    if (!v) return NaN;
    // Acepta el número completo (B0100000801) o solo la secuencia (801)
    const soloDigitos = v.toUpperCase().replace(/^[BE]\d{2}/, "").replace(/\D/g, "");
    return Number(soloDigitos);
  };
  const desde = leerNumero("desde");
  const hasta = leerNumero("hasta");
  const siguienteTexto = texto(d, "siguiente");
  const siguiente = siguienteTexto ? leerNumero("siguiente") : desde;
  if (!tipo) return { error: "Elige el tipo de comprobante." };
  if (!Number.isInteger(desde) || desde < 1) return { error: "El número inicial no es válido." };
  if (!Number.isInteger(hasta) || hasta < desde) return { error: "El número final debe ser mayor o igual que el inicial." };
  if (!Number.isInteger(siguiente) || siguiente < desde || siguiente > hasta + 1)
    return { error: "El próximo número a usar debe estar dentro del rango." };
  const max = tipo.startsWith("B") ? 99_999_999 : 9_999_999_999;
  if (hasta > max) return { error: `Para ${tipo} el número no puede pasar de ${max}.` };

  const { data: solapa } = await s.supabase
    .from("secuencias")
    .select("id")
    .eq("tipo", tipo)
    .lte("desde", hasta)
    .gte("hasta", desde)
    .limit(1);
  if (solapa?.length) return { error: "Ese rango se cruza con otra secuencia del mismo tipo." };

  const { error } = await s.supabase.from("secuencias").insert({ tipo, desde, hasta, siguiente, vence: texto(d, "vence") });
  if (error) return { error: mensaje(error) };
  refrescar();
  return { ok: "Secuencia registrada." };
}

export async function alternarSecuencia(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesion();
  if ("error" in s) return { error: s.error };
  const { error } = await s.supabase.from("secuencias").update({ activa: d.get("activa") === "true" }).eq("id", texto(d, "id"));
  if (error) return { error: mensaje(error) };
  refrescar();
  return { ok: "Listo." };
}

// ---------------------------------------------------------------------
// Datos de facturación del cliente
// ---------------------------------------------------------------------

export async function guardarFacturacionCliente(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesion();
  if ("error" in s) return { error: s.error };
  const dias = Number(texto(d, "dias_credito") ?? 0);
  if (!Number.isInteger(dias) || dias < 0 || dias > 365) return { error: "Los días de crédito deben estar entre 0 y 365." };
  const limiteTexto = texto(d, "limite_credito")?.replace(/,/g, "") ?? null;
  const limite = limiteTexto === null ? null : Number(limiteTexto);
  if (limite !== null && (!Number.isFinite(limite) || limite < 0)) return { error: "El límite de crédito no es válido." };
  const { error } = await s.supabase
    .from("clientes")
    .update({
      limite_credito: limite,
      tipo_comprobante: texto(d, "tipo_comprobante"),
      dias_credito: dias,
      correo_facturas: texto(d, "correo_facturas"),
      exento_itbis: d.get("exento_itbis") === "on",
      moneda: ["USD", "EUR"].includes(texto(d, "moneda") ?? "") ? texto(d, "moneda") : "DOP",
    })
    .eq("id", texto(d, "id"));
  if (error) return { error: mensaje(error) };
  refrescar();
  return { ok: "Datos de facturación guardados." };
}
