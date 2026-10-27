import "server-only";
import { supabasePublico } from "./supabase/server";
import type { Empresa, Factura, FormaPago, LineaFactura } from "./tipos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FacturaPublica = {
  factura: Omit<Factura, "token">;
  tipo_nombre: string | null;
  referencia_ncf: string | null;
  lineas: LineaFactura[];
  empresa: (Empresa & { mensaje_ticket?: string | null }) | null;
  pagos?: { forma: FormaPago; monto: number; numero: string; fecha: string; cambio: number }[];
  saldo?: number;
};

export async function leerFactura(token: string): Promise<FacturaPublica | null> {
  if (!UUID.test(token)) return null;
  const { data, error } = await supabasePublico().rpc("factura_publica", { p_token: token });
  if (error || !data) return null;
  return data as FacturaPublica;
}

/** Título del documento como sale impreso */
export function tituloDocumento(d: FacturaPublica): string {
  const f = d.factura;
  if (f.tipo_doc === "proforma") return "Factura proforma";
  return d.tipo_nombre ?? (f.tipo_doc === "nota_credito" ? "Nota de crédito" : "Factura");
}
