import { notFound, redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";
import { PERMISOS, type Permiso } from "@/lib/permisos";

export type Negocio = {
  id: string; nombre: string; slug: string; plan: string; prueba_hasta: string; moneda: string;
  apariencia: Record<string, unknown>;
};
export type Rol = "dueno" | "admin" | "encargado" | "verificador";

export { PERMISOS, NOMBRE_PERMISO, type Permiso } from "@/lib/permisos";

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
    .select("rol, sucursal_id, permisos, sucursales")
    .eq("negocio_id", negocio.id)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  const miembro = (yo ?? { rol: "verificador", sucursal_id: null, permisos: [], sucursales: [] }) as {
    rol: Rol; sucursal_id: string | null; permisos: Permiso[] | null; sucursales: string[] | null;
  };
  const esDueno = miembro.rol === "dueno";
  const permisos = esDueno ? [...PERMISOS] : (miembro.permisos ?? []);
  const alcance = esDueno ? null : miembro.sucursales;           // null = todas las sucursales
  /** ¿Tiene esta casilla? Sin sucursal: en todo el negocio (todas las sucursales). Con sucursal: en esa. */
  const puede = (permiso: Permiso, sucursal?: string | null) =>
    esDueno || (permisos.includes(permiso) && (alcance === null || (Boolean(sucursal) && alcance.includes(sucursal as string))));
  /** ¿Tiene esta casilla en alguna sucursal? (para mostrar la sección aunque sea limitada) */
  const algo = (permiso: Permiso) => esDueno || (permisos.includes(permiso) && (alcance === null || alcance.length > 0));
  return {
    supabase,
    usuario: auth.user,
    negocio,
    rol: miembro.rol,
    miSucursal: miembro.sucursal_id ?? (alcance && alcance.length === 1 ? alcance[0] : null),
    permisos,
    alcance,
    puede,
    algo,
    esDueno,
    // «administra» = todas las casillas en todas las sucursales (dueño o administrador completo)
    administra: esDueno || (alcance === null && PERMISOS.every((x) => permisos.includes(x))),
  };
}
