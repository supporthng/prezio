import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

/** Cliente con la clave SECRETA de Supabase: solo en el servidor (acciones y rutas), solo para crear cuentas
 *  de usuarios sin correo y cambiarles la clave, SIEMPRE después de que la base confirmó el permiso de quien
 *  lo pide. La clave va en Vercel › Environment Variables como «Secret» y sin el prefijo NEXT_PUBLIC_. */
export function supabaseAdmin(): SupabaseClient {
  if (typeof window !== "undefined") throw new Error("supabaseAdmin solo funciona en el servidor");
  const clave = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!clave) throw new Error("Falta SUPABASE_SECRET_KEY en Vercel (Settings › Environment Variables, tipo Secret).");
  return createClient(SUPABASE_URL, clave, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export const hayClaveSecreta = () => Boolean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);

/** Correo interno de un usuario sin correo (igual que public.correo_de_usuario en la base). */
export const correoDeUsuario = (negocioId: string, usuario: string) =>
  `${usuario.trim().toLowerCase()}@n${negocioId.replace(/-/g, "")}.prezio.invalid`;

export const USUARIO_VALIDO = /^[a-z0-9][a-z0-9._-]{2,29}$/;
