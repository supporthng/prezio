import { supabaseServidor } from "@/lib/supabase/server";
import { nombreArchivo, todosLosProductos } from "@/lib/respaldo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Respaldo completo del negocio en un archivo (dueño o admin): configuración, sucursales, inventarios con
 *  todos sus productos y equipos. No incluye claves: las de equipos y conectores no se pueden recuperar. */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await supabaseServidor();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Entra a Prezio para descargar.", { status: 401 });
  const { data: neg } = await supabase.from("negocios").select("id, nombre, slug, moneda, apariencia").eq("slug", slug).maybeSingle();
  const negocio = neg as { id: string; nombre: string; slug: string; moneda: string; apariencia: unknown } | null;
  if (!negocio) return new Response("No encontrado.", { status: 404 });
  const { data: yo } = await supabase.from("miembros").select("rol").eq("negocio_id", negocio.id).eq("user_id", auth.user.id).maybeSingle();
  const rol = (yo as { rol: string } | null)?.rol;
  if (rol !== "dueno" && rol !== "admin") return new Response("Solo el dueño o un administrador descargan el respaldo.", { status: 403 });

  const [{ data: sucursales }, { data: inventarios }, { data: equipos }] = await Promise.all([
    supabase.from("sucursales").select("id, codigo, nombre, es_principal, activa, fuente").eq("negocio_id", negocio.id).order("nombre"),
    supabase.from("inventarios").select("id, nombre, origen, actualizado").eq("negocio_id", negocio.id).order("nombre"),
    supabase.from("equipos").select("nombre, sucursal_id, creado, visto, app").eq("negocio_id", negocio.id).order("creado"),
  ]);
  const conProductos = await Promise.all(((inventarios ?? []) as { id: string }[]).map(async (i) => ({
    ...i, productos: await todosLosProductos(supabase, i.id),
  })));
  const respaldo = {
    formato: "prezio-respaldo-1",
    creado: new Date().toISOString(),
    negocio: { nombre: negocio.nombre, slug: negocio.slug, moneda: negocio.moneda, apariencia: negocio.apariencia },
    sucursales: sucursales ?? [],
    inventarios: conProductos,
    equipos: equipos ?? [],
  };
  return new Response(JSON.stringify(respaldo, null, 1), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="respaldo-${nombreArchivo(negocio.nombre)}-${respaldo.creado.slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
