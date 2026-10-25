/** Lo que guarda y usa un equipo sin internet: su clave, los precios y las consultas por subir (IndexedDB),
 *  y las llamadas a Supabase con la clave pública + la clave del equipo (el equipo no inicia sesión). */

import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

export const APP_EQUIPO = "web 1.0";

export type InfoEquipo = {
  equipo: { id: string; nombre: string };
  negocio: { nombre: string; slug: string; moneda: string; apariencia: Record<string, unknown> };
  sucursal: { id: string; nombre: string; codigo: string };
  version: string;
  hora: string;
  salida?: Salida | null;
};
export type Salida = { sal: string; iter: number; hash: string };
export type Catalogo = { version: string; productos: [string, string, number | string][] };
export type ConsultaPendiente = { codigo: string; encontrado: boolean; nombre?: string; precio?: number; hora: string };

// ---------------------------------------------------------------- IndexedDB
const BASE = "prezio-equipo";
let abierta: Promise<IDBDatabase> | null = null;

function bd(): Promise<IDBDatabase> {
  abierta ??= new Promise((ok, mal) => {
    const pedido = indexedDB.open(BASE, 1);
    pedido.onupgradeneeded = () => {
      const b = pedido.result;
      if (!b.objectStoreNames.contains("datos")) b.createObjectStore("datos");
      if (!b.objectStoreNames.contains("pendientes")) b.createObjectStore("pendientes", { autoIncrement: true });
    };
    pedido.onsuccess = () => ok(pedido.result);
    pedido.onerror = () => { abierta = null; mal(pedido.error); };
  });
  return abierta;
}

function hecho<T>(p: IDBRequest<T>): Promise<T> {
  return new Promise((ok, mal) => { p.onsuccess = () => ok(p.result); p.onerror = () => mal(p.error); });
}

export async function leer<T>(clave: string): Promise<T | undefined> {
  const b = await bd();
  return hecho(b.transaction("datos").objectStore("datos").get(clave)) as Promise<T | undefined>;
}
export async function guardar(clave: string, valor: unknown): Promise<void> {
  const b = await bd();
  await hecho(b.transaction("datos", "readwrite").objectStore("datos").put(valor, clave));
}
export async function borrar(clave: string): Promise<void> {
  const b = await bd();
  await hecho(b.transaction("datos", "readwrite").objectStore("datos").delete(clave));
}

const MAX_PENDIENTES = 20000;

export async function anotar(c: ConsultaPendiente): Promise<void> {
  const b = await bd();
  const tienda = b.transaction("pendientes", "readwrite").objectStore("pendientes");
  await hecho(tienda.add(c));
  // Si pasa mucho tiempo sin internet, se guardan las más recientes.
  const n = await hecho(tienda.count());
  if (n > MAX_PENDIENTES) {
    const claves = await hecho(tienda.getAllKeys(null, n - MAX_PENDIENTES));
    for (const k of claves) tienda.delete(k);
  }
}
export async function contarPendientes(): Promise<number> {
  const b = await bd();
  return hecho(b.transaction("pendientes").objectStore("pendientes").count());
}
export async function lotePendientes(n: number): Promise<{ claves: IDBValidKey[]; filas: ConsultaPendiente[] }> {
  const b = await bd();
  const tienda = b.transaction("pendientes").objectStore("pendientes");
  const [claves, filas] = await Promise.all([hecho(tienda.getAllKeys(null, n)), hecho(tienda.getAll(null, n))]);
  return { claves, filas: filas as ConsultaPendiente[] };
}
export async function quitarPendientes(claves: IDBValidKey[]): Promise<void> {
  if (!claves.length) return;
  const b = await bd();
  const tx = b.transaction("pendientes", "readwrite");
  // Las claves son números crecientes: se borra el rango completo de una vez.
  tx.objectStore("pendientes").delete(IDBKeyRange.bound(claves[0], claves[claves.length - 1]));
  await new Promise<void>((ok, mal) => { tx.oncomplete = () => ok(); tx.onerror = () => mal(tx.error); });
}

/** Clave propia del equipo: 64 cifras hexadecimales al azar. Solo su huella llega a Prezio. */
export function claveNueva(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------- Supabase
export class ErrorEquipo extends Error {
  constructor(mensaje: string, public tipo: "pendiente" | "no_valido" | "red" | "otro") { super(mensaje); }
}

export async function llamar<T>(funcion: string, args: Record<string, unknown>, ms = 20000): Promise<T> {
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), ms);
  let r: Response;
  try {
    r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${funcion}`, {
      method: "POST",
      // Solo «apikey»: sin Authorization, Supabase usa el rol anónimo (vale con clave publishable o anon).
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
      signal: control.signal,
    });
  } catch {
    throw new ErrorEquipo("Sin conexión", "red");
  } finally {
    clearTimeout(t);
  }
  const texto = await r.text();
  if (!r.ok) {
    let mensaje = texto;
    try { mensaje = (JSON.parse(texto) as { message?: string }).message ?? texto; } catch { /* texto plano */ }
    if (/equipo_pendiente/.test(mensaje)) throw new ErrorEquipo(mensaje, "pendiente");
    if (/equipo_no_valido/.test(mensaje)) throw new ErrorEquipo(mensaje, "no_valido");
    throw new ErrorEquipo(mensaje || `Error ${r.status}`, r.status >= 500 ? "red" : "otro");
  }
  return JSON.parse(texto) as T;
}
