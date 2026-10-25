import { supabaseServidor } from "@/lib/supabase/server";
import { aCsv, nombreArchivo, todosLosProductos } from "@/lib/respaldo";

export const dynamic = "force-dynamic";

/** Descargar un inventario como CSV (respaldo o para editarlo en Excel y volver a cargarlo). */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServidor();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Entra a Prezio para descargar.", { status: 401 });
  // La base solo lo devuelve si el usuario es miembro del negocio.
  const { data: inv } = await supabase.from("inventarios").select("nombre").eq("id", id).maybeSingle();
  if (!inv) return new Response("No encontrado.", { status: 404 });
  const csv = aCsv(await todosLosProductos(supabase, id));
  const fecha = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreArchivo((inv as { nombre: string }).nombre)}-${fecha}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
