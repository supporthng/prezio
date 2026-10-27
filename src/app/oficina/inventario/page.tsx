import type { Metadata } from "next";
import Link from "next/link";
import { Encabezado, Indicador } from "@/components/Encabezado";
import { BotonEnviar, Formulario } from "@/components/Formulario";
import { Icono } from "@/components/Icono";
import { monto, montoEntero } from "@/lib/facturacion";
import { fechaSimple } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Producto } from "@/lib/tipos";
import { guardarDatosVenta, moverInventario } from "./acciones";

export const metadata: Metadata = { title: "Inventario" };

const TEXTO_MOV: Record<string, string> = {
  entrada: "Entrada",
  venta: "Venta",
  devolucion: "Devolución",
  anulacion: "Anulación",
  ajuste: "Ajuste",
  uso: "Uso",
};

export default async function Inventario({ searchParams }: PageProps<"/oficina/inventario">) {
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim().toLowerCase() ?? "";
  const supabase = await supabaseServidor();
  const [{ data }, { data: movs }] = await Promise.all([
    supabase.from("productos").select("*").eq("activo", true).order("nombre"),
    supabase.from("movimientos_inventario").select("fecha, tipo, cantidad, motivo, factura_id, productos(nombre, unidad)").order("fecha", { ascending: false }).limit(25),
  ]);
  const todos = (data ?? []) as Required<Producto>[];
  const productos = q ? todos.filter((p) => [p.nombre, p.ingrediente_activo].some((x) => x?.toLowerCase().includes(q))) : todos;
  const bajos = todos.filter((p) => Number(p.minimo) > 0 && Number(p.existencia) <= Number(p.minimo));
  const valor = todos.reduce((s, p) => s + Math.max(Number(p.existencia), 0) * Number(p.costo), 0);

  return (
    <div className="space-y-5">
      <Encabezado
        titulo="Productos de consumo"
        detalle="Existencias, costos y precios. Las ventas y las notas de crédito mueven el inventario solas."
        acciones={
          <>
            <Link href="/oficina/importar?tipo=productos" className="boton-sec"><Icono nombre="importar" tam={16} /> Importar</Link>
            <Link href="/oficina/ajustes#productos" className="boton"><Icono nombre="mas" tam={16} /> Nuevo producto</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador titulo="Productos" valor={todos.length} detalle={`${todos.filter((p) => p.se_vende).length} se venden`} icono="inventario" />
        <Indicador titulo="Valor del inventario" valor={montoEntero(valor)} detalle="Existencia × costo" icono="dinero" />
        <Indicador titulo="Bajo el mínimo" valor={bajos.length} detalle={bajos.slice(0, 2).map((p) => p.nombre).join(", ") || "Todo en orden"} tono={bajos.length ? "alerta" : "normal"} icono="alerta" />
        <Indicador titulo="Agotados" valor={todos.filter((p) => Number(p.existencia) <= 0).length} detalle="Existencia en cero o menos" icono="caja" />
      </div>

      <form className="relative max-w-sm">
        <Icono nombre="buscar" tam={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
        <input type="search" name="q" defaultValue={q} className="campo pl-9" placeholder="Buscar producto o ingrediente" aria-label="Buscar producto" />
      </form>

      {productos.length === 0 ? (
        <div className="tarjeta p-10 text-center text-sm text-stone-500">
          No hay productos. Agrégalos en <Link href="/oficina/ajustes#productos" className="font-semibold text-marca-600">Ajustes</Link> o impórtalos desde Excel.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {productos.map((p) => {
            const ex = Number(p.existencia);
            const bajo = Number(p.minimo) > 0 && ex <= Number(p.minimo);
            return (
              <article key={p.id} className="tarjeta flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-bold">{p.nombre}</h2>
                    <p className="truncate text-xs text-stone-500">{[p.ingrediente_activo, p.registro && `Reg. ${p.registro}`].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                  <div className="text-right">
                    <div className={`font-display text-2xl font-semibold tabular-nums ${ex <= 0 ? "text-orange-700" : bajo ? "text-amber-700" : ""}`}>{ex}</div>
                    <div className="text-xs text-stone-500">{p.unidad}{Number(p.minimo) > 0 ? ` · mín. ${Number(p.minimo)}` : ""}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {p.se_vende ? <span className="chip bg-marca-50 text-marca-700">Se vende a {monto(p.precio_venta)}</span> : <span className="chip bg-stone-100 text-stone-600">Solo uso interno</span>}
                  {bajo && <span className="chip bg-amber-50 text-amber-800">Bajo el mínimo</span>}
                  {ex <= 0 && <span className="chip bg-orange-50 text-orange-700">Agotado</span>}
                </div>

                <Formulario accion={moverInventario} limpiar className="grid grid-cols-[1fr_90px_auto] gap-2">
                  <input type="hidden" name="id" value={p.id} />
                  <select name="tipo" className="campo h-9 py-1 text-sm" aria-label={`Movimiento de ${p.nombre}`} defaultValue="entrada">
                    <option value="entrada">Entrada (compra)</option>
                    <option value="uso">Salida por uso</option>
                    <option value="conteo">Conteo físico: hay…</option>
                  </select>
                  <input name="cantidad" inputMode="decimal" className="campo h-9 py-1 text-right text-sm" placeholder="Cant." aria-label={`Cantidad de ${p.nombre}`} required />
                  <BotonEnviar className="boton boton-chico h-9" pendiente="…">Aplicar</BotonEnviar>
                </Formulario>

                <details className="group">
                  <summary className="cursor-pointer text-[13px] font-semibold text-marca-600">Precio, costo y mínimo</summary>
                  <Formulario accion={guardarDatosVenta} className="mt-3 grid grid-cols-2 gap-2">
                    <input type="hidden" name="id" value={p.id} />
                    <div>
                      <label className="etiqueta" htmlFor={`pv-${p.id}`}>Precio de venta</label>
                      <input id={`pv-${p.id}`} name="precio_venta" inputMode="decimal" className="campo" defaultValue={Number(p.precio_venta)} />
                    </div>
                    <div>
                      <label className="etiqueta" htmlFor={`co-${p.id}`}>Costo</label>
                      <input id={`co-${p.id}`} name="costo" inputMode="decimal" className="campo" defaultValue={Number(p.costo)} />
                    </div>
                    <div>
                      <label className="etiqueta" htmlFor={`mi-${p.id}`}>Mínimo</label>
                      <input id={`mi-${p.id}`} name="minimo" inputMode="decimal" className="campo" defaultValue={Number(p.minimo)} />
                    </div>
                    <div>
                      <label className="etiqueta" htmlFor={`it-${p.id}`}>ITBIS</label>
                      <select id={`it-${p.id}`} name="itbis_tasa" className="campo" defaultValue={Number(p.itbis_tasa)}>
                        <option value={18}>18 %</option>
                        <option value={16}>16 %</option>
                        <option value={0}>Exento</option>
                      </select>
                    </div>
                    <label className="col-span-2 flex items-center gap-2 text-sm">
                      <input type="checkbox" name="se_vende" defaultChecked={p.se_vende} className="h-4 w-4 accent-marca-600" /> Se vende en mostrador y en facturas
                    </label>
                    <div className="col-span-2">
                      <BotonEnviar className="boton boton-chico">Guardar</BotonEnviar>
                    </div>
                  </Formulario>
                </details>
              </article>
            );
          })}
        </div>
      )}

      <section className="tarjeta overflow-x-auto">
        <h2 className="subtitulo p-5 pb-2">Últimos movimientos</h2>
        {(movs ?? []).length === 0 ? (
          <p className="px-5 pb-5 text-sm text-stone-500">Todavía no hay movimientos.</p>
        ) : (
          <table className="w-full min-w-[560px] text-sm">
            <tbody className="divide-y divide-stone-100">
              {((movs ?? []) as unknown as { fecha: string; tipo: string; cantidad: number; motivo: string | null; factura_id: string | null; productos: { nombre: string; unidad: string } | null }[]).map((m, i) => (
                <tr key={i}>
                  <td className="px-5 py-2 whitespace-nowrap text-stone-500">{fechaSimple(m.fecha.slice(0, 10))}</td>
                  <td className="px-2 py-2 font-semibold">{m.productos?.nombre}</td>
                  <td className="px-2 py-2">
                    <span className="chip bg-stone-100 text-stone-700">{TEXTO_MOV[m.tipo] ?? m.tipo}</span>{" "}
                    {m.factura_id ? (
                      <Link href={`/oficina/facturacion/${m.factura_id}`} className="text-marca-600 hover:underline">{m.motivo}</Link>
                    ) : (
                      <span className="text-stone-600">{m.motivo}</span>
                    )}
                  </td>
                  <td className={`px-5 py-2 text-right font-bold tabular-nums ${Number(m.cantidad) > 0 ? "text-marca-700" : "text-orange-700"}`}>
                    {Number(m.cantidad) > 0 ? "+" : ""}
                    {Number(m.cantidad)} {m.productos?.unidad}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
