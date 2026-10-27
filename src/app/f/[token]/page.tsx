import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { leerFactura, tituloDocumento } from "@/lib/factura-publica";
import { monto, numeroDocumento, TEXTO_ECF, TEXTO_FORMA } from "@/lib/facturacion";
import { fechaSimple } from "@/lib/formato";
import { BotonImprimir } from "@/components/BotonImprimir";

export async function generateMetadata({ params }: PageProps<"/f/[token]">): Promise<Metadata> {
  const { token } = await params;
  const d = await leerFactura(token);
  return {
    title: d ? `${tituloDocumento(d)} ${numeroDocumento(d.factura)}` : "Factura",
    robots: { index: false, follow: false },
  };
}

export default async function FacturaCliente({ params }: PageProps<"/f/[token]">) {
  const { token } = await params;
  const d = await leerFactura(token);
  if (!d) notFound();
  const f = d.factura;
  const e = d.empresa;
  const numero = numeroDocumento(f);

  return (
    <main className="min-h-screen bg-stone-100 px-3 py-6 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-3xl flex-wrap justify-end gap-2 print:hidden">
        <a href={`/f/${token}/pdf`} className="boton">Descargar PDF</a>
        <a href={`/f/${token}/ticket`} className="boton-sec">Ticket</a>
        <BotonImprimir />
      </div>

      <article className="relative mx-auto max-w-3xl overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-stone-200 print:rounded-none print:shadow-none print:ring-0">
        <div className="h-1.5 bg-marca-700" />
        {f.estado === "anulada" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <span className="-rotate-12 text-7xl font-bold tracking-widest text-red-600/15">ANULADA</span>
          </div>
        )}
        <div className="space-y-6 p-6 sm:p-10">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-5">
            <div>
              <h1 className="text-2xl font-semibold text-marca-800">{e?.nombre}</h1>
              {e?.rnc && <p className="mt-1 text-xs text-stone-500">RNC {e.rnc}</p>}
              <p className="text-xs text-stone-500">
                {[e?.telefono && `Tel. ${e.telefono}`, e?.whatsapp && `WhatsApp ${e.whatsapp}`, e?.correo].filter(Boolean).join(" · ")}
              </p>
              {e?.direccion && <p className="text-xs text-stone-500">{e.direccion}</p>}
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold uppercase tracking-wide text-stone-700">{tituloDocumento(d)}</p>
              <p className="font-mono text-lg font-semibold">{f.ncf ? `NCF ${numero}` : numero}</p>
              {f.ncf_vence && <p className="text-xs text-stone-500">Válido hasta {fechaSimple(f.ncf_vence)}</p>}
              <p className="text-xs text-stone-500">Fecha {fechaSimple(f.fecha)}</p>
            </div>
          </header>

          {f.estado === "anulada" && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Este documento fue anulado.</p>
          )}

          <section className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-marca-700">Cliente</div>
              <div className="font-medium">{f.razon_social ?? f.cliente_nombre}</div>
              {f.razon_social && f.cliente_nombre && f.razon_social !== f.cliente_nombre && (
                <div className="text-stone-500">{f.cliente_nombre}</div>
              )}
              {f.rnc && <div className="text-stone-500">RNC/Cédula {f.rnc}</div>}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 sm:justify-self-end">
              {d.referencia_ncf && (
                <>
                  <dt className="text-stone-500">NCF modificado</dt>
                  <dd className="font-mono">{d.referencia_ncf}</dd>
                </>
              )}
              {f.vence && (
                <>
                  <dt className="text-stone-500">{f.tipo_doc === "proforma" ? "Válida hasta" : "Fecha de pago"}</dt>
                  <dd>{fechaSimple(f.vence)}</dd>
                </>
              )}
              {f.tipo_doc === "factura" && (
                <>
                  <dt className="text-stone-500">Condición</dt>
                  <dd>{f.dias_credito ? `Crédito ${f.dias_credito} días` : "Contado"}</dd>
                </>
              )}
            </dl>
          </section>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b border-stone-200 text-left text-xs text-stone-500">
                <tr>
                  <th className="py-2 pr-2 font-medium">Descripción</th>
                  <th className="px-2 py-2 text-right font-medium">Cant.</th>
                  <th className="px-2 py-2 text-right font-medium">Precio</th>
                  <th className="px-2 py-2 text-right font-medium">ITBIS</th>
                  <th className="py-2 pl-2 text-right font-medium">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 tabular-nums">
                {d.lineas.map((l, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-2">
                      {l.descripcion}
                      {Number(l.descuento) > 0 && <div className="text-xs text-stone-500">Descuento {monto(l.descuento, f.moneda)}</div>}
                    </td>
                    <td className="px-2 py-2 text-right">{Number(l.cantidad)}</td>
                    <td className="px-2 py-2 text-right">{monto(l.precio, f.moneda)}</td>
                    <td className="px-2 py-2 text-right">{Number(l.itbis_tasa) ? monto(l.itbis, f.moneda) : "Exento"}</td>
                    <td className="py-2 pl-2 text-right">{monto(l.subtotal, f.moneda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="ml-auto grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm tabular-nums">
            <dt className="text-stone-500">Subtotal</dt>
            <dd className="text-right">{monto(f.subtotal, f.moneda)}</dd>
            {Number(f.descuento) > 0 && (
              <>
                <dt className="text-stone-500">Descuento</dt>
                <dd className="text-right">− {monto(f.descuento, f.moneda)}</dd>
              </>
            )}
            <dt className="text-stone-500">ITBIS</dt>
            <dd className="text-right">{monto(f.itbis, f.moneda)}</dd>
            <dt className="border-t border-stone-200 pt-2 font-semibold">Total</dt>
            <dd className="border-t border-stone-200 pt-2 text-right text-lg font-semibold">{monto(f.total, f.moneda)}</dd>
            {f.moneda && f.moneda !== "DOP" && (
              <>
                <dt className="text-xs text-stone-500">Tasa {Number(f.tasa_cambio)} · en pesos</dt>
                <dd className="text-right text-xs text-stone-500">{monto(Number(f.total) * Number(f.tasa_cambio))}</dd>
              </>
            )}
          </dl>

          {f.tipo_doc === "factura" && f.estado === "emitida" && (d.pagos?.length ?? 0) > 0 && (
            <dl className="ml-auto grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm tabular-nums">
              {(d.pagos ?? []).map((p, i) => (
                <div key={i} className="contents">
                  <dt className="text-stone-500">Pagado · {TEXTO_FORMA[p.forma]}</dt>
                  <dd className="text-right">{monto(p.monto, f.moneda)}</dd>
                </div>
              ))}
              <dt className="font-semibold">Saldo pendiente</dt>
              <dd className="text-right font-semibold">{monto(d.saldo ?? 0, f.moneda)}</dd>
            </dl>
          )}
          {f.notas && <p className="whitespace-pre-line text-sm text-stone-600">{f.notas}</p>}
          {f.estado_ecf !== "no_aplica" && f.estado_ecf !== "aceptado" && (
            <p className="text-xs text-stone-500">Comprobante fiscal electrónico · {TEXTO_ECF[f.estado_ecf].toLowerCase()}.</p>
          )}
          {f.tipo_doc === "proforma" && (
            <p className="text-xs text-stone-500">Documento sin valor fiscal. La factura con comprobante se emite al confirmar el servicio.</p>
          )}
        </div>
      </article>
    </main>
  );
}
