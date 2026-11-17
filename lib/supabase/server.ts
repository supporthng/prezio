import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { dominioBase, dominioCookies } from "@/lib/subdominio";
import { SUPABASE_KEY, SUPABASE_URL, variablesFaltantes } from "./config";

type CookieNueva = { name: string; value: string; options: CookieOptions };

/** Cliente de Supabase para componentes de servidor, acciones y rutas.
 *  Usa la sesión del usuario (cookies) y la clave pública: lo que puede ver lo decide la RLS. */
export async function supabaseServidor() {
  const faltan = variablesFaltantes();
  if (faltan.length) throw new Error("Faltan en Vercel: " + faltan.join(", "));
  const almacen = await cookies();
  const dominio = dominioCookies((await headers()).get("host") ?? "", dominioBase(process.env.NEXT_PUBLIC_SITE_URL || "https://prezcio.app"));
  return createServerClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      ...(dominio ? { cookieOptions: { domain: dominio } } : {}),
      cookies: {
        getAll() {
          return almacen.getAll();
        },
        setAll(lista: CookieNueva[]) {
          try {
            lista.forEach(({ name, value, options }) => almacen.set(name, value, options));
          } catch {
            // Llamado desde un componente de servidor: el middleware ya renueva la sesión.
          }
        },
      },
    },
  );
}

/** Usuario con sesión iniciada (validado con Supabase), o null. */
export async function usuarioActual() {
  if (variablesFaltantes().length) return null;
  const supabase = await supabaseServidor();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
