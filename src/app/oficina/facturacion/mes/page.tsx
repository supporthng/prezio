import type { Metadata } from "next";
import Link from "next/link";
import { BotonEnviar, Formulario } from "@/components/Formulario";
import { monto } from "@/lib/facturacion";
import { fechaSimple, hoyRD } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import type { VisitaPorFacturar } from "@/lib/tipos";
import { facturarPeriodo } from "../acciones";

export const metadata: Metadata = { title: "Facturar servicios del mes" };

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const esFecha = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function FacturarMes({ searchParams }: PageProps<"/oficina/facturacion/mes">) {
  const sp = await searchParams;
  const hoy = hoyRD();
  const desde = esFecha(uno(sp.desde)) ? uno(sp.desde)! : `${hoy.slice(0, 7)}-01`;
  const hasta = esFecha(uno(sp.hasta)) ? uno(sp.hasta)! : hoy;

  const supabase = await supabaseServidor();
  const [{ data }, { data: cli }] = await Promise.all([
    supabase.from("visitas_por_facturar").select("*").gte("fecha", desde).lte("fecha", hasta).order("cliente").order("fecha").limit(5000),
    supabase.from("clientes").select("id, razon_social, rnc, tipo_comprobante"),
  ]);
  const visitas = (data ?? []) as VisitaPorFacturar[];
  const infoCliente = new Map((cli ?? []).map((c) => [c.id as string, c]));

  const grupos = new Map<string, { cliente: string; exento: boolean; visitas: VisitaPorFacturar[] }>();
  for (const v of visitas) {
    const g = grupos.get(v.cliente_id) ?? { cliente: v.cliente, exento: v.exento_itbis, visitas: [] };
    g.visitas.push(v);
    grupos.set(v.cliente_id, g);
  }
  const lista = [...grupos.entries()];
  const total = (vs: VisitaPorFacturar[], exento: boolean) => {
    const neto = vs.reduce((s, v) => s + Number(v.precio ?? 0), 0);
    return neto + (exento ? 0 : Math.round(neto * 18) / 100);
  };
  const sinPrecio = visitas.filter((v) => !Number(v.precio)).length;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/oficina/facturacion" className="text-sm text-marca-700 hover:underline">← Facturación</Link>
        <h1 className="titulo mt-1">Facturar servicios realizados</h1>
        <p className="text-sm text-stone-500">
          Se crea un borrador por cliente con todas sus sucursales. Después revisas cada uno y lo emites.
        </p>
      </div>

      <form className="tarjeta flex flex-wrap items-end gap-3 p-4">
        <div className="space-y-1">
          <label className="etiqueta" htmlFor="desde">Desde</label>
          <input id="desde" name="desde" type="date" defaultValue={desde} className="campo" />
        </div>
        <div className="space-y-1">
          <label className="etiqueta" htmlFor="hasta">Hasta</label>
          <input id="hasta" name="hasta" type="date" defaultValue={hasta} className="campo" />
        </div>
        <button className="boton-sec">Ver servicios</button>
      </form>

      {lista.length === 0 ? (
        <div className="tarjeta p-8 text-center text-sm text-stone-500">
          No hay servicios realizados sin facturar entre el {fechaSimple(desde)} y el {fechaSimple(hasta)}.
        </div>
      ) : (
        <Formulario accion={facturarPeriodo} className="space-y-3">
          <input type="hidden" name="desde" value={desde} />
          <input type="hidden" name="hasta" value={hasta} />
          {sinPrecio > 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {sinPrecio} servicio{sinPrecio === 1 ? "" : "s"} no tiene{sinPrecio === 1 ? "" : "n"} precio. Ponle el precio en el borrador antes de emitir.
            </p>
          )}
          <div className="tarjeta divide-y divide-stone-100">
            {lista.map(([id, g]) => {
              const c = infoCliente.get(id);
              const tipo = c?.tipo_comprobante ?? (c?.rnc?.trim() ? "B01" : "B02");
              return (
                <div key={id} className="flex items-start gap-3 px-4 py-3">
                  <input type="checkbox" name="clientes" value={id} defaultChecked className="mt-1 h-4 w-4 accent-marca-600" aria-label={`Facturar a ${g.cliente}`} />
                <details className="group min-w-0 flex-1">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{g.cliente}</span>
                      <span className="block text-xs text-stone-500">
                        {c?.razon_social && c.razon_social !== g.cliente ? `${c.razon_social} · ` : ""}
                        {tipo} · {g.visitas.length} servicio{g.visitas.length === 1 ? "" : "s"}
                        {g.exento ? " · exento" : ""}
                      </span>
                    </span>
                    <span className="tabular-nums font-medium">{monto(total(g.visitas, g.exento))}</span>
                    <span className="text-xs text-marca-700 group-open:hidden">Ver detalle</span>
                  </summary>
                  <ul className="mt-2 space-y-1 text-sm">
                    {g.visitas.map((v) => (
                      <li key={v.id} className="flex justify-between gap-2">
                        <span>
                          {fechaSimple(v.fecha)} · {v.sucursal} · <span className="text-stone-500">{v.servicio ?? "Servicio"}</span>
                        </span>
                        <span className={`tabular-nums ${Number(v.precio) ? "" : "text-amber-700"}`}>{Number(v.precio) ? monto(v.precio) : "sin precio"}</span>
                      </li>
                    ))}
                  </ul>
                </details>
                </div>
              );
            })}
          </div>
          <BotonEnviar pendiente="Creando borradores…">Crear borradores de factura</BotonEnviar>
        </Formulario>
      )}
    </div>
  );
}
