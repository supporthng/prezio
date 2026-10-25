import { NextResponse } from "next/server";
import { enviarEnPartes, productosDeGoogle, type OrigenGoogle } from "@/lib/fuentes";
import { rpcAnonimo } from "@/lib/rpc";

// La llama la tarea programada de Supabase cada 15 minutos (pg_cron + pg_net), con la clave interna de la base
// en el encabezado «x-prezio-tareas». Prezio no guarda esa clave: se la devuelve a la base, que la comprueba.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Pendiente = { id: string; origen: OrigenGoogle };

export async function POST(request: Request) {
  const secreto = request.headers.get("x-prezio-tareas") ?? "";
  if (secreto.length < 32) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  let pendientes: Pendiente[];
  try {
    pendientes = await rpcAnonimo<Pendiente[]>("google_pendientes", { p_secreto: secreto, p_maximo: 10 });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const inicio = Date.now();
  const resultado: { id: string; productos?: number; error?: string }[] = [];
  for (const p of pendientes) {
    if (Date.now() - inicio > 45000) break;   // lo que falte, en la próxima vuelta
    try {
      const lista = await productosDeGoogle(p.origen);
      const n = await enviarEnPartes(lista, (lote, parte, fin) => rpcAnonimo<number>("google_aplicar", {
        p_secreto: secreto, p_inventario: p.id, p_lote: lote, p_productos: parte, p_fin: fin,
      }, 60000));
      resultado.push({ id: p.id, productos: n });
    } catch (e) {
      const error = e instanceof Error ? e.message : "Error";
      resultado.push({ id: p.id, error });
      await rpcAnonimo("google_aplicar", {
        p_secreto: secreto, p_inventario: p.id, p_lote: null, p_productos: null, p_fin: false, p_error: error,
      }).catch(() => {});
    }
  }
  return NextResponse.json({ revisadas: resultado.length, resultado });
}
