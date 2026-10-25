import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_KEY, SUPABASE_URL } from "./config";

/** Cliente de Supabase en el navegador (misma sesión que el servidor; la RLS decide qué se puede hacer). */
export function supabaseNavegador() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
}
