import { perfilActual } from "@/lib/auth";
import { COLUMNAS_607, COLUMNAS_608, datos607, datos608, libroReporte } from "@/lib/reportes-dgii";

export async function GET(req: Request) {
  const perfil = await perfilActual();
  if (!perfil || perfil.rol === "tecnico") return new Response("No autorizado", { status: 403 });
  const url = new URL(req.url);
  const tipo = url.searchParams.get("tipo");
  const mes = url.searchParams.get("mes") ?? "";
  if (!/^\d{4}-\d{2}$/.test(mes) || !["607", "608"].includes(tipo ?? "")) {
    return new Response("Parámetros no válidos", { status: 400 });
  }
  const buffer =
    tipo === "607"
      ? await libroReporte("607", COLUMNAS_607, await datos607(mes), Array.from({ length: 16 }, (_, i) => i + 8))
      : await libroReporte("608", COLUMNAS_608, await datos608(mes));
  const nombre = `${tipo} ${mes.replace("-", "")}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
