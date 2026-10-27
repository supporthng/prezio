"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { perfilActual } from "@/lib/auth";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Resultado } from "@/lib/tipos";

async function sesion() {
  const perfil = await perfilActual();
  if (!perfil || perfil.rol === "tecnico") return { error: "No tienes permiso." } as const;
  return { perfil, supabase: await supabaseServidor() } as const;
}

function mensaje(error: { message: string; code?: string } | null, porDefecto = "No se pudo guardar.") {
  if (!error) return porDefecto;
  if (error.code === "P0001") return error.message;
  if (error.code === "42501") return "No tienes permiso para esto.";
  return `${porDefecto} (${error.message})`;
}

const texto = (d: FormData, k: string) => {
  const v = d.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

type Pago = { forma: string; monto: number; referencia?: string | null };

export async function registrarCobro(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesion();
  if ("error" in s) return { error: s.error };
  let datos: { cliente_id: string; fecha: string; notas?: string; moneda?: string; tasa_cambio?: number | null; pagos: Pago[]; aplicaciones: { factura_id: string; monto: number }[] };
  try {
    datos = JSON.parse(String(d.get("datos")));
  } catch {
    return { error: "Los datos del cobro no son válidos." };
  }
  if (!datos.cliente_id) return { error: "Elige el cliente." };
  const pagos = (datos.pagos ?? []).filter((p) => Number(p.monto) > 0);
  if (!pagos.length) return { error: "Indica cuánto pagó el cliente." };
  const { data, error } = await s.supabase.rpc("registrar_cobro", {
    p: { ...datos, pagos, aplicaciones: (datos.aplicaciones ?? []).filter((a) => Number(a.monto) > 0) },
  });
  if (error) return { error: mensaje(error, "No se pudo registrar el cobro.") };
  revalidatePath("/oficina", "layout");
  redirect(`/oficina/cobros/${data}?nuevo=1`);
}

export async function anularCobro(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesion();
  if ("error" in s) return { error: s.error };
  const { error } = await s.supabase.rpc("anular_cobro", { p_id: texto(d, "id"), p_motivo: texto(d, "motivo") });
  if (error) return { error: mensaje(error, "No se pudo anular el recibo.") };
  revalidatePath("/oficina", "layout");
  return { ok: "Recibo anulado. Las facturas vuelven a quedar pendientes." };
}

export async function devolverSaldo(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesion();
  if ("error" in s) return { error: s.error };
  const montoTexto = texto(d, "monto")?.replace(/,/g, "");
  const { error } = await s.supabase.rpc("devolver_saldo", {
    p_cliente: texto(d, "cliente"),
    p_monto: Number(montoTexto),
    p_forma: texto(d, "forma") ?? "efectivo",
    p_nota: texto(d, "nota"),
  });
  if (error) return { error: mensaje(error, "No se pudo registrar la devolución.") };
  revalidatePath("/oficina", "layout");
  return { ok: "Devolución registrada." };
}

export type ResultadoVenta = { error?: string; venta?: { factura_id: string; ncf: string; token: string; total: number; cambio: number } };

export async function ventaRapida(datos: unknown): Promise<ResultadoVenta> {
  const s = await sesion();
  if ("error" in s) return { error: s.error };
  const { data, error } = await s.supabase.rpc("venta_rapida", { p: datos });
  if (error) return { error: mensaje(error, "No se pudo completar la venta.") };
  revalidatePath("/oficina", "layout");
  const v = data as { factura_id: string; ncf: string; token: string; total: number; cambio: number };
  return { venta: { ...v, total: Number(v.total), cambio: Number(v.cambio) } };
}
