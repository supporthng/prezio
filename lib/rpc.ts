import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

/** Llama una función de la base sin sesión (rol anónimo): la usan la tarea programada y el conector,
 *  que se identifican con su propia clave dentro de los argumentos. */
export async function rpcAnonimo<T>(funcion: string, args: Record<string, unknown>, ms = 30000): Promise<T> {
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), ms);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${funcion}`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
      signal: control.signal,
    });
    const texto = await r.text();
    if (!r.ok) {
      let mensaje = texto;
      try { mensaje = (JSON.parse(texto) as { message?: string }).message ?? texto; } catch { /* texto plano */ }
      throw new ErrorRpc(mensaje || `Error ${r.status}`, r.status);
    }
    return (texto ? JSON.parse(texto) : null) as T;
  } finally {
    clearTimeout(t);
  }
}

export class ErrorRpc extends Error {
  constructor(mensaje: string, public estado: number) { super(mensaje); }
}
