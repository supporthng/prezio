import "server-only";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Producto, Servicio, TipoComprobante, VisitaPorFacturar } from "@/lib/tipos";
import type { ClienteFacturacion } from "./Editor";

/** Todo lo que necesita el editor de facturas */
export async function datosEditor() {
  const supabase = await supabaseServidor();
  const [{ data: clientes }, { data: tipos }, { data: servicios }, { data: pendientes }, { data: productos }, { data: cuentas }] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, nombre, razon_social, rnc, tipo_comprobante, dias_credito, exento_itbis, limite_credito, moneda")
      .eq("activo", true)
      .order("nombre")
      .limit(5000),
    supabase.from("tipos_comprobante").select("*").order("codigo"),
    supabase.from("servicios").select("*").order("nombre"),
    supabase.from("visitas_por_facturar").select("*").order("fecha").limit(5000),
    supabase.from("productos").select("*").eq("activo", true).eq("se_vende", true).order("nombre"),
    supabase.from("clientes_cuenta").select("id, pendiente").gt("pendiente", 0).limit(5000),
  ]);
  const deuda = new Map((cuentas ?? []).map((c) => [c.id as string, Number(c.pendiente)]));
  return {
    clientes: ((clientes ?? []) as ClienteFacturacion[]).map((c): ClienteFacturacion => ({
      ...c,
      limite_credito: c.limite_credito == null ? null : Number(c.limite_credito),
      pendiente: deuda.get(c.id) ?? 0,
    })),
    productos: (productos ?? []) as Producto[],
    tipos: (tipos ?? []) as TipoComprobante[],
    servicios: (servicios ?? []) as Servicio[],
    pendientes: (pendientes ?? []) as VisitaPorFacturar[],
  };
}
