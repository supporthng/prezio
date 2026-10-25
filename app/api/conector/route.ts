import { NextResponse } from "next/server";
import { rpcAnonimo, ErrorRpc } from "@/lib/rpc";

// El conector de SQL Server (en la PC del negocio) habla solo con esta dirección, con su clave.
//   {"accion":"estado", "clave", "version", "equipo", "error"}
//   {"accion":"subir",  "clave", "inventario", "lote", "productos":[{codigo,nombre,precio}], "fin", "error"}
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);

export async function POST(request: Request) {
  let d: Record<string, unknown>;
  try { d = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: "Pedido inválido" }, { status: 400 }); }
  const clave = texto(d.clave, 128) ?? "";
  try {
    if (d.accion === "estado") {
      const r = await rpcAnonimo("conector_estado", {
        p_clave: clave, p_version: texto(d.version, 40), p_equipo: texto(d.equipo, 80), p_error: texto(d.error, 300),
      });
      return NextResponse.json(r);
    }
    if (d.accion === "subir") {
      const n = await rpcAnonimo<number>("conector_subir", {
        p_clave: clave, p_inventario: texto(d.inventario, 40), p_lote: texto(d.lote, 40),
        p_productos: Array.isArray(d.productos) ? d.productos : null, p_fin: d.fin === true, p_error: texto(d.error, 300),
      }, 60000);
      return NextResponse.json({ productos: n });
    }
    return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error";
    const estado = /conector_no_valido/.test(mensaje) ? 401 : e instanceof ErrorRpc && e.estado < 500 ? 400 : 502;
    return NextResponse.json({ error: /conector_no_valido/.test(mensaje) ? "Clave de conector no válida o quitada" : mensaje }, { status: estado });
  }
}

export function GET() {
  return NextResponse.json({ servicio: "Prezio · conector", ok: true });
}
