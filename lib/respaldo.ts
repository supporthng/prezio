import type { supabaseServidor } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof supabaseServidor>>;
export type FilaProducto = { codigo: string; nombre: string; precio: number };

/** Todos los productos de un inventario, de 1000 en 1000 (la base entrega máximo 1000 por pedido). */
export async function todosLosProductos(supabase: Supabase, inventario: string): Promise<FilaProducto[]> {
  const lista: FilaProducto[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from("productos").select("codigo, nombre, precio")
      .eq("inventario_id", inventario).order("codigo").range(desde, desde + 999);
    if (error) throw new Error(error.message);
    const filas = (data ?? []) as FilaProducto[];
    lista.push(...filas.map((p) => ({ ...p, precio: Number(p.precio) })));
    if (filas.length < 1000) return lista;
  }
}

/** CSV que Excel abre bien (UTF-8 con BOM, separado por comas) y que Prezio vuelve a cargar tal cual. */
export function aCsv(productos: FilaProducto[]): string {
  const celda = (v: string) => (/[",\n\r;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const filas = productos.map((p) => [celda(p.codigo), celda(p.nombre), p.precio.toFixed(2)].join(","));
  return "﻿" + ["codigo,nombre,precio", ...filas].join("\r\n") + "\r\n";
}

export function nombreArchivo(texto: string): string {
  return texto.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "prezio";
}
