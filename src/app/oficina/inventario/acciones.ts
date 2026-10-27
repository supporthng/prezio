"use server";

import { revalidatePath } from "next/cache";
import { perfilActual } from "@/lib/auth";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Resultado } from "@/lib/tipos";

const texto = (d: FormData, k: string) => {
  const v = d.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};
const numero = (d: FormData, k: string) => {
  const v = texto(d, k);
  return v === null ? null : Number(v.replace(/,/g, ""));
};

async function sesion() {
  const perfil = await perfilActual();
  if (!perfil || perfil.rol === "tecnico") return { error: "No tienes permiso." } as const;
  return { supabase: await supabaseServidor() } as const;
}

export async function guardarDatosVenta(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesion();
  if ("error" in s) return { error: s.error };
  const precio = numero(d, "precio_venta") ?? 0;
  const costo = numero(d, "costo") ?? 0;
  const minimo = numero(d, "minimo") ?? 0;
  const itbis = Number(texto(d, "itbis_tasa") ?? 18);
  if ([precio, costo, minimo].some((x) => !Number.isFinite(x) || x < 0)) return { error: "Revisa los números: no pueden ser negativos." };
  if (![0, 16, 18].includes(itbis)) return { error: "El ITBIS no es válido." };
  const { error } = await s.supabase
    .from("productos")
    .update({ precio_venta: precio, costo, minimo, itbis_tasa: itbis, se_vende: d.get("se_vende") === "on" })
    .eq("id", texto(d, "id"));
  if (error) return { error: `No se pudo guardar. (${error.message})` };
  revalidatePath("/oficina", "layout");
  return { ok: "Guardado." };
}

export async function moverInventario(_: Resultado, d: FormData): Promise<Resultado> {
  const s = await sesion();
  if ("error" in s) return { error: s.error };
  const id = texto(d, "id");
  const tipo = texto(d, "tipo");
  const cantidad = numero(d, "cantidad");
  if (!id || !tipo) return { error: "Faltan datos." };
  if (cantidad === null || !Number.isFinite(cantidad) || (tipo !== "conteo" && cantidad <= 0) || cantidad < 0)
    return { error: "Indica una cantidad válida." };

  let mov = cantidad;
  let tipoMov: "entrada" | "uso" | "ajuste" = "entrada";
  if (tipo === "uso") {
    mov = -cantidad;
    tipoMov = "uso";
  } else if (tipo === "conteo") {
    const { data } = await s.supabase.from("productos").select("existencia").eq("id", id).single();
    mov = Math.round((cantidad - Number(data?.existencia ?? 0)) * 100) / 100;
    tipoMov = "ajuste";
    if (mov === 0) return { ok: "La existencia ya era esa. No hubo cambios." };
  }
  const motivo = texto(d, "motivo") ?? (tipo === "entrada" ? "Compra" : tipo === "uso" ? "Uso en servicios" : "Conteo físico");
  const { error } = await s.supabase.from("movimientos_inventario").insert({ producto_id: id, tipo: tipoMov, cantidad: mov, motivo });
  if (error) return { error: `No se pudo registrar. (${error.message})` };
  revalidatePath("/oficina", "layout");
  return { ok: tipo === "conteo" ? `Existencia ajustada (${mov > 0 ? "+" : ""}${mov}).` : "Movimiento registrado." };
}
