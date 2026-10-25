import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

/** Cliente con la clave SECRETA de Supabase: solo en el servidor (acciones y rutas), solo para crear cuentas
 *  de usuarios sin correo y cambiarles la clave, SIEMPRE después de que la base confirmó el permiso de quien
 *  lo pide. La clave va en Vercel › Environment Variables como «Secret» y sin el prefijo NEXT_PUBLIC_.
 *
 *  Sirve cualquiera de las dos claves secretas de Supabase:
 *   · la nueva «secret key» (sb_secret_…): se manda solo en la cabecera apikey, sin «Authorization»,
 *     porque no es un JWT y las rutas de administración de cuentas la rechazarían
 *     («This endpoint requires a valid Bearer token»);
 *   · la anterior «service_role» (un JWT que empieza con eyJ…). */
function claveSecreta(): string {
  return (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim().replace(/^["']|["']$/g, "");
}

/** Qué tiene de malo la clave puesta en Vercel (null = parece bien). */
export function problemaClaveSecreta(): string | null {
  const clave = claveSecreta();
  if (!clave) return "Falta SUPABASE_SECRET_KEY en Vercel (Settings › Environment Variables, tipo Secret).";
  if (clave.startsWith("sb_publishable_")) return "En SUPABASE_SECRET_KEY pusiste la clave PUBLICABLE (sb_publishable_…). Va la clave secreta.";
  if (clave.startsWith("sb_secret_")) return clave.includes("•") ? "La clave de SUPABASE_SECRET_KEY está incompleta (se copió con puntos ••••). Cópiala con el botón de copiar." : null;
  const partes = clave.split(".");
  if (partes.length === 3 && clave.startsWith("eyJ")) {
    try {
      const datos = JSON.parse(atob(partes[1].replace(/-/g, "+").replace(/_/g, "/"))) as { role?: string };
      if (datos.role === "anon") return "En SUPABASE_SECRET_KEY pusiste la clave «anon» (pública). Va la «service_role» o la «secret key».";
      if (datos.role !== "service_role") return "La clave de SUPABASE_SECRET_KEY no es la «service_role».";
      return null;
    } catch {
      return "La clave de SUPABASE_SECRET_KEY está mal copiada.";
    }
  }
  return "La clave de SUPABASE_SECRET_KEY no parece una clave secreta de Supabase (empieza con sb_secret_… o con eyJ…).";
}

export function supabaseAdmin(): SupabaseClient {
  if (typeof window !== "undefined") throw new Error("supabaseAdmin solo funciona en el servidor");
  const problema = problemaClaveSecreta();
  if (problema) throw new Error(problema);
  const clave = claveSecreta();
  const nueva = clave.startsWith("sb_secret_");
  return createClient(SUPABASE_URL, clave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: nueva ? {
      // La clave nueva no es un JWT: va solo en «apikey» y Supabase pone el permiso de administrador.
      fetch: (entrada: RequestInfo | URL, init?: RequestInit) => {
        const h = new Headers(init?.headers);
        if (h.get("Authorization") === `Bearer ${clave}`) h.delete("Authorization");
        return fetch(entrada, { ...init, headers: h });
      },
    } : undefined,
  });
}

export const hayClaveSecreta = () => problemaClaveSecreta() === null;

/** Error de Supabase al administrar cuentas, en palabras simples. */
export function errorDeCuentas(e: { message?: string } | null | undefined): string | null {
  const m = e?.message ?? "";
  if (/valid Bearer token|bad_jwt|invalid JWT|Invalid API key|not_admin|User not allowed/i.test(m)) {
    return "Supabase rechazó la clave secreta de Vercel. En Supabase › Project Settings › API Keys › «Legacy API keys», copia la "
      + "clave «service_role» (empieza con eyJ…), ponla en Vercel como SUPABASE_SECRET_KEY y vuelve a publicar (Redeploy).";
  }
  return null;
}

/** Correo interno de un usuario sin correo (igual que public.correo_de_usuario en la base). */
export const correoDeUsuario = (negocioId: string, usuario: string) =>
  `${usuario.trim().toLowerCase()}@n${negocioId.replace(/-/g, "")}.prezio.invalid`;

export const USUARIO_VALIDO = /^[a-z0-9][a-z0-9._-]{2,29}$/;
