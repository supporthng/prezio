import { notFound, redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";

export type Negocio = {
  id: string; nombre: string; slug: string; plan: string; prueba_hasta: string; moneda: string;
  apariencia: Record<string, unknown>;
};
export type Rol = "dueno" | "admin" | "encargado" | "verificador";

/** Negocio de la dirección + el rol del usuario. Si no es miembro, «no existe» (la RLS no lo devuelve). */
export async function cargarNegocio(slug: string, volverA: string) {
  const supabase = await supabaseServidor();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/entrar?siguiente=${encodeURIComponent(volverA)}`);
  const { data } = await supabase
    .from("negocios")
    .select("id, nombre, slug, plan, prueba_hasta, moneda, apariencia")
    .eq("slug", slug)
    .maybeSingle();
  const negocio = data as Negocio | null;
  if (!negocio) notFound();
  const { data: yo } = await supabase
    .from("miembros")
    .select("rol, sucursal_id")
    .eq("negocio_id", negocio.id)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  const miembro = (yo ?? { rol: "verificador", sucursal_id: null }) as { rol: Rol; sucursal_id: string | null };
  return {
    supabase,
    usuario: auth.user,
    negocio,
    rol: miembro.rol,
    miSucursal: miembro.sucursal_id,
    administra: miembro.rol === "dueno" || miembro.rol === "admin",
  };
}
