import type { Metadata } from "next";
import { supabaseServidor } from "@/lib/supabase/server";
import type { ClienteCuenta, Producto, Servicio, TipoComprobante } from "@/lib/tipos";
import { PuntoDeVenta, type ClientePos } from "./PuntoDeVenta";

export const metadata: Metadata = { title: "Venta rápida" };

export default async function Venta() {
  const supabase = await supabaseServidor();
  const [{ data: cli }, { data: cuentas }, { data: servicios }, { data: productos }, { data: tipos }, { data: emp }] = await Promise.all([
    supabase.from("clientes").select("id, nombre, razon_social, rnc, telefono, tipo_comprobante, dias_credito, exento_itbis, limite_credito, generico").eq("activo", true).order("nombre").limit(5000),
    supabase.from("clientes_cuenta").select("id, pendiente, saldo_favor, max_dias_vencida").or("pendiente.gt.0,saldo_favor.gt.0").limit(5000),
    supabase.from("servicios").select("*").eq("activo", true).order("nombre"),
    supabase.from("productos").select("*").eq("activo", true).eq("se_vende", true).order("nombre"),
    supabase.from("tipos_comprobante").select("*").eq("es_nota_credito", false).order("codigo"),
    supabase.from("empresa").select("bloquear_credito").eq("id", 1).maybeSingle(),
  ]);
  const cuenta = new Map(((cuentas ?? []) as Pick<ClienteCuenta, "id" | "pendiente" | "saldo_favor" | "max_dias_vencida">[]).map((c) => [c.id, c]));
  const clientes: ClientePos[] = (cli ?? [])
    .filter((c) => !c.generico)
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      razon_social: c.razon_social,
      rnc: c.rnc,
      telefono: c.telefono,
      tipo_comprobante: c.tipo_comprobante,
      dias_credito: c.dias_credito ?? 0,
      exento_itbis: !!c.exento_itbis,
      limite_credito: c.limite_credito === null ? null : Number(c.limite_credito),
      pendiente: Number(cuenta.get(c.id)?.pendiente ?? 0),
      saldo_favor: Number(cuenta.get(c.id)?.saldo_favor ?? 0),
      vencidas: (cuenta.get(c.id)?.max_dias_vencida ?? 0) > 0,
    }));

  return (
    <PuntoDeVenta
      clientes={clientes}
      servicios={(servicios ?? []) as Servicio[]}
      productos={(productos ?? []) as Producto[]}
      tipos={(tipos ?? []) as TipoComprobante[]}
      bloquearCredito={!!emp?.bloquear_credito}
    />
  );
}
