import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_KEY, SUPABASE_URL } from "./config";
import { dominioBase, dominioCookies } from "@/lib/subdominio";

/** Cliente de Supabase en el navegador (misma sesión que el servidor; la RLS decide qué se puede hacer). */
export function supabaseNavegador() {
  const dominio = typeof window === "undefined" ? undefined
    : dominioCookies(window.location.host, dominioBase(process.env.NEXT_PUBLIC_SITE_URL || "https://prezcio.app"));
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY, dominio ? { cookieOptions: { domain: dominio } } : {});
}
