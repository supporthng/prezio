import "server-only";
import ExcelJS from "exceljs";
import { supabaseServidor } from "./supabase/server";
import type { Factura } from "./tipos";

/** Rango de un mes AAAA-MM */
export function rangoMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  const fin = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(fin).padStart(2, "0")}` };
}

const aaaammdd = (f: string) => f.replaceAll("-", "");
const soloDigitos = (t: string | null) => (t ?? "").replace(/\D/g, "");

/** 1 = RNC (9 dígitos), 2 = cédula (11 dígitos), 3 = otro */
function tipoIdentificacion(rnc: string | null): string {
  const d = soloDigitos(rnc);
  if (!d) return "";
  if (d.length === 9) return "1";
  if (d.length === 11) return "2";
  return "3";
}

export const COLUMNAS_607 = [
  "RNC/Cédula o Pasaporte",
  "Tipo Identificación",
  "Número Comprobante Fiscal",
  "Número Comprobante Fiscal Modificado",
  "Tipo de Ingreso",
  "Fecha Comprobante",
  "Fecha de Retención",
  "Monto Facturado",
  "ITBIS Facturado",
  "ITBIS Retenido por Terceros",
  "ITBIS Percibido",
  "Retención Renta por Terceros",
  "ISR Percibido",
  "Impuesto Selectivo al Consumo",
  "Otros Impuestos/Tasas",
  "Monto Propina Legal",
  "Efectivo",
  "Cheque/ Transferencia/ Depósito",
  "Tarjeta Débito/Crédito",
  "Venta a Crédito",
  "Bonos o Certificados de Regalo",
  "Permuta",
  "Otras Formas de Ventas",
];

export const COLUMNAS_608 = ["Número Comprobante Fiscal", "Fecha Comprobante", "Tipo de Anulación"];

type Doc = Pick<
  Factura,
  "ncf" | "tipo_doc" | "rnc" | "fecha" | "subtotal" | "descuento" | "itbis" | "total" | "dias_credito" | "referencia_id" | "motivo_anulacion" | "id" | "tasa_cambio"
>;

export async function datos607(mes: string) {
  const { desde, hasta } = rangoMes(mes);
  const supabase = await supabaseServidor();
  const { data, error } = await supabase
    .from("facturas")
    .select("id, ncf, tipo_doc, rnc, fecha, subtotal, descuento, itbis, total, dias_credito, referencia_id, motivo_anulacion, tasa_cambio")
    .in("tipo_doc", ["factura", "nota_credito"])
    .eq("estado", "emitida")
    .not("ncf", "is", null)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha")
    .order("ncf");
  if (error) throw new Error(error.message);
  const docs = (data ?? []) as Doc[];
  const refIds = [...new Set(docs.map((d) => d.referencia_id).filter(Boolean))] as string[];
  const refs = new Map<string, string>();
  if (refIds.length) {
    const { data: r } = await supabase.from("facturas").select("id, ncf").in("id", refIds);
    for (const x of r ?? []) refs.set(x.id as string, x.ncf as string);
  }
  // Formas de pago reales: cada cobro se reparte en proporción a sus formas de pago
  const { data: aplic } = await supabase
    .from("cobro_aplicaciones")
    .select("factura_id, monto, cobros!inner(estado, total, cambio, cobro_pagos(forma, monto)), facturas!inner(fecha)")
    .eq("cobros.estado", "activo")
    .gte("facturas.fecha", desde)
    .lte("facturas.fecha", hasta);
  type Ap = { factura_id: string; monto: number; cobros: { total: number; cambio: number; cobro_pagos: { forma: string; monto: number }[] } };
  const porFactura = new Map<string, Record<"efectivo" | "banco" | "tarjeta" | "otras", number>>();
  for (const a of (aplic ?? []) as unknown as Ap[]) {
    const k = a.cobros;
    const bruto = k.cobro_pagos.reduce((s, p) => s + Number(p.monto), 0);
    if (!bruto) continue;
    const r = porFactura.get(a.factura_id) ?? { efectivo: 0, banco: 0, tarjeta: 0, otras: 0 };
    for (const p of k.cobro_pagos) {
      let m = Number(p.monto);
      if (p.forma === "efectivo") m -= Number(k.cambio); // el cambio sale del efectivo
      const parte = (Math.max(m, 0) / (bruto - Number(k.cambio) || 1)) * Number(a.monto);
      const destino = p.forma === "efectivo" ? "efectivo" : p.forma === "tarjeta" ? "tarjeta" : p.forma === "transferencia" || p.forma === "cheque" ? "banco" : "otras";
      r[destino] += parte;
    }
    porFactura.set(a.factura_id, r);
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const celda = (n: number) => (n > 0.004 ? r2(n) : "");

  return docs.map((d) => {
    // Todo en pesos con la tasa de la factura
    const t = Number(d.tasa_cambio ?? 1);
    const neto = r2((Number(d.subtotal) - Number(d.descuento)) * t);
    const total = Number(d.total);
    const base = d.tipo_doc === "factura" ? (porFactura.get(d.id) ?? { efectivo: 0, banco: 0, tarjeta: 0, otras: 0 }) : null;
    const credito = base ? Math.max(total - base.efectivo - base.banco - base.tarjeta - base.otras, 0) * t : 0;
    const p = base ? { efectivo: base.efectivo * t, banco: base.banco * t, tarjeta: base.tarjeta * t, otras: base.otras * t } : null;
    return [
      soloDigitos(d.rnc),
      tipoIdentificacion(d.rnc),
      d.ncf!,
      d.referencia_id ? (refs.get(d.referencia_id) ?? "") : "",
      "01", // Ingresos por operaciones (no financieros)
      aaaammdd(d.fecha),
      "",
      neto,
      r2(Number(d.itbis) * t),
      "", "", "", "", "", "", "",
      p ? celda(p.efectivo) : "",
      p ? celda(p.banco) : "",
      p ? celda(p.tarjeta) : "",
      p ? celda(credito) : "",
      "",
      "",
      p ? celda(p.otras) : "",
    ] as (string | number)[];
  });
}

export async function datos608(mes: string) {
  const { desde, hasta } = rangoMes(mes);
  const supabase = await supabaseServidor();
  const { data, error } = await supabase
    .from("facturas")
    .select("ncf, fecha, motivo_anulacion, anulada_en")
    .eq("estado", "anulada")
    .not("ncf", "is", null)
    .gte("anulada_en", `${desde}T00:00:00-04:00`)
    .lte("anulada_en", `${hasta}T23:59:59.999-04:00`)
    .order("ncf");
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => {
    const tipo = String(d.motivo_anulacion ?? "").match(/^\s*(\d{2})/)?.[1] ?? "04";
    return [d.ncf as string, aaaammdd(d.fecha as string), tipo];
  });
}

export async function libroReporte(titulo: string, columnas: string[], filas: (string | number)[][], numericas: number[] = []) {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Fumio";
  const hoja = libro.addWorksheet(titulo);
  hoja.addRow(columnas);
  hoja.getRow(1).font = { bold: true };
  hoja.getRow(1).alignment = { wrapText: true, vertical: "middle" };
  for (const f of filas) hoja.addRow(f);
  hoja.columns.forEach((c, i) => {
    c.width = Math.max(14, Math.min(28, columnas[i].length + 2));
    if (numericas.includes(i + 1)) c.numFmt = "#,##0.00";
    else c.numFmt = "@"; // texto: no pierde ceros a la izquierda
  });
  hoja.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await libro.xlsx.writeBuffer());
}
