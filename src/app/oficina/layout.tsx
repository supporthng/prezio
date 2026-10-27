import { Icono } from "@/components/Icono";
import { exigirOficina } from "@/lib/auth";
import { etiquetaRol, hoyRD } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { salir } from "./acciones";
import { Menu, type Avisos } from "./Menu";

async function contarAvisos(): Promise<Avisos> {
  const supabase = await supabaseServidor();
  const hoy = hoyRD();
  const contar = async (p: PromiseLike<{ count: number | null }>) => (await p).count ?? 0;
  const [reprogramar, borradores, vencidas, productos] = await Promise.all([
    contar(supabase.from("visitas_detalle").select("id", { count: "exact", head: true }).eq("por_reprogramar", true)),
    contar(supabase.from("facturas").select("id", { count: "exact", head: true }).eq("estado", "borrador")),
    contar(supabase.from("facturas_cobro").select("id", { count: "exact", head: true }).gt("saldo", 0).lt("vence", hoy)),
    supabase.from("productos").select("existencia, minimo").eq("activo", true).gt("minimo", 0),
  ]);
  const bajoMinimo = (productos.data ?? []).filter((p) => Number(p.existencia) <= Number(p.minimo)).length;
  return { reprogramar, borradores, vencidas, bajoMinimo };
}

export default async function LayoutOficina({ children }: LayoutProps<"/oficina">) {
  const perfil = await exigirOficina();
  const avisos = await contarAvisos();
  const iniciales = perfil.nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  const usuario = (
    <div className="flex items-center gap-3 border-t border-white/10 px-2 pt-4">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lima text-[13px] font-extrabold text-marca-900">
        {iniciales || "?"}
      </span>
      <span className="flex min-w-0 flex-1 flex-col text-[13px] leading-tight">
        <b className="truncate text-white">{perfil.nombre}</b>
        <span className="text-marca-300">{etiquetaRol(perfil.rol)}</span>
      </span>
      <form action={salir}>
        <button className="rounded-lg p-2 text-marca-300 transition hover:bg-white/10 hover:text-white" aria-label="Salir" title="Salir">
          <Icono nombre="salir" />
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-screen">
      <Menu avisos={avisos} usuario={usuario} />
      <div className="lg:pl-[248px] print:pl-0">
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8 print:p-0">{children}</main>
      </div>
    </div>
  );
}
