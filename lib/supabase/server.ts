import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Cliente de Supabase para componentes de servidor, acciones y rutas.
 *  Usa la sesión del usuario (cookies) y la clave pública: lo que puede ver lo decide la RLS. */
export async function supabaseServidor() {
  const almacen = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return almacen.getAll();
        },
        setAll(lista) {
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
  const supabase = await supabaseServidor();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
