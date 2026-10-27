import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { chipEstado, chipPago, monto, NOMBRE_DOC, numeroDocumento, TEXTO_ECF, TEXTO_FORMA, TEXTO_REEMBOLSO } from "@/lib/facturacion";
import { Icono } from "@/components/Icono";
import { enlaceWhatsapp, fechaSimple, hoyRD } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Factura, FacturaCobro, FormaPago, LineaFactura, TipoComprobante } from "@/lib/tipos";
import { Anular, BorrarBorrador, ConvertirProforma, CopiarEnlace, HacerNotaCredito } from "../Acciones";
import { datosEditor } from "../datos";
import { Editor, type ClienteFacturacion } from "../Editor";

export async function generateMetadata({ params }: PageProps<"/oficina/facturacion/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { title: "Factura" };
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("facturas").select("ncf, numero_proforma, estado, tipo_doc").eq("id", id).maybeSingle();
  return { title: data ? `${NOMBRE_DOC[data.tipo_doc as Factura["tipo_doc"]]} ${numeroDocumento(data as Factura)}` : "Factura" };
}

export default async function Documento({ params, searchParams }: PageProps<"/oficina/facturacion/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const supabase = await supabaseServidor();

  const [{ data: doc }, { data: lin }, { data: hijos }] = await Promise.all([
    supabase.from("facturas").select("*").eq("id", id).maybeSingle(),
    supabase.from("factura_lineas").select("*").eq("factura_id", id).order("orden"),
    supabase
      .from("facturas")
      .select("id, tipo_doc, ncf, numero_proforma, estado, total, referencia_id, proforma_id")
      .or(`referencia_id.eq.${id},proforma_id.eq.${id}`)
      .order("creado_en"),
  ]);
  if (!doc) notFound();
  const f = doc as Factura;
  const lineas = (lin ?? []) as LineaFactura[];
  const relacionados = (hijos ?? []) as Factura[];

  const [{ data: ref }, { data: prof }, { data: tipoRow }, { data: cli }] = await Promise.all([
    f.referencia_id
      ? supabase.from("facturas").select("id, ncf, total").eq("id", f.referencia_id).maybeSingle()
      : Promise.resolve({ data: null }),
    f.proforma_id
      ? supabase.from("facturas").select("id, numero_proforma").eq("id", f.proforma_id).maybeSingle()
      : Promise.resolve({ data: null }),
    f.tipo_ncf ? supabase.from("tipos_comprobante").select("*").eq("codigo", f.tipo_ncf).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("clientes").select("id, nombre, razon_social, rnc, telefono, tipo_comprobante, dias_credito, exento_itbis").eq("id", f.cliente_id).maybeSingle(),
  ]);
  const tipo = tipoRow as TipoComprobante | null;

  const aviso = error && (
    <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
  );

  // ----- Borrador: se edita -----
  if (f.estado === "borrador") {
    const d = await datosEditor();
    const refSaldo = f.referencia_id
      ? Number((await supabase.from("facturas_cobro").select("saldo").eq("id", f.referencia_id).maybeSingle()).data?.saldo ?? 0)
      : undefined;
    // Si el cliente está inactivo igual debe aparecer
    if (cli && !d.clientes.some((c) => c.id === cli.id)) {
      d.clientes.push(cli as ClienteFacturacion);
    }
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link href="/oficina/facturacion" className="text-sm text-marca-700 hover:underline">← Facturación</Link>
            <h1 className="titulo mt-1">
              {NOMBRE_DOC[f.tipo_doc]} <span className="text-stone-400">· borrador</span>
            </h1>
            {prof && <p className="text-sm text-stone-500">Viene de la proforma {prof.numero_proforma}</p>}
          </div>
          <BorrarBorrador id={f.id} />
        </div>
        {aviso}
        <Editor
          {...d}
          inicial={{
            id: f.id,
            tipo_doc: f.tipo_doc,
            tipo_ncf: f.tipo_ncf,
            cliente_id: f.cliente_id,
            fecha: f.fecha,
            dias_credito: f.dias_credito,
            notas: f.notas,
            referencia_id: f.referencia_id,
            referencia_ncf: ref?.ncf ?? null,
            referencia_saldo: refSaldo,
            reembolso: f.reembolso,
            moneda: f.moneda,
            tasa_cambio: Number(f.tasa_cambio ?? 1),
            devuelve_inventario: f.devuelve_inventario,
            lineas: lineas.map((l) => ({
              descripcion: l.descripcion,
              servicio_id: l.servicio_id,
              producto_id: l.producto_id ?? null,
              visita_id: l.visita_id,
              cantidad: Number(l.cantidad),
              precio: Number(l.precio),
              descuento: Number(l.descuento),
              itbis_tasa: Number(l.itbis_tasa),
            })),
          }}
        />
      </div>
    );
  }

  // ----- Emitida o anulada: solo lectura -----
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const enlace = `${proto}://${host}/f/${f.token}`;
  const numero = numeroDocumento(f);
  const chip = chipEstado(f.estado, f.vence, hoyRD(), f.tipo_doc);
  const wa = enlaceWhatsapp(
    cli?.telefono,
    `Hola, le compartimos su ${NOMBRE_DOC[f.tipo_doc].toLowerCase()} ${numero} por ${monto(f.total, f.moneda)}: ${enlace}`,
  );
  const ncActivas = relacionados.filter((r) => r.tipo_doc === "nota_credito" && r.estado !== "anulada");
  const facturaDeProforma = relacionados.find((r) => r.tipo_doc === "factura" && r.proforma_id === f.id && r.estado !== "anulada");

  // Cobros de la factura
  const esFacturaEmitida = f.tipo_doc === "factura" && f.estado === "emitida";
  const [{ data: cobroRow }, { data: aplicaciones }] = esFacturaEmitida
    ? await Promise.all([
        supabase.from("facturas_cobro").select("*").eq("id", f.id).maybeSingle(),
        supabase
          .from("cobro_aplicaciones")
          .select("monto, cobros!inner(id, numero, fecha, estado, cobro_pagos(forma))")
          .eq("factura_id", f.id)
          .eq("cobros.estado", "activo"),
      ])
    : [{ data: null }, { data: [] }];
  const fc = cobroRow as FacturaCobro | null;
  const pagosFactura = (aplicaciones ?? []) as unknown as {
    monto: number;
    cobros: { id: string; numero: string; fecha: string; cobro_pagos: { forma: FormaPago }[] };
  }[];
  const pago = fc ? chipPago(fc.estado_pago, fc.dias_vencida) : null;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/oficina/facturacion" className="text-sm text-marca-700 hover:underline">← Facturación</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="titulo">
            {NOMBRE_DOC[f.tipo_doc]} {numero}
          </h1>
          <span className={`chip ${chip.clase}`}>{chip.texto}</span>
          {pago && <span className={`chip ${pago.clase}`}>{pago.texto}</span>}
          {f.estado_ecf !== "no_aplica" && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${f.estado_ecf === "rechazado" ? "bg-red-50 text-red-700" : f.estado_ecf === "aceptado" ? "bg-marca-50 text-marca-800" : "bg-amber-50 text-amber-800"}`}>
              {TEXTO_ECF[f.estado_ecf]}
            </span>
          )}
        </div>
        {tipo && <p className="text-sm text-stone-500">{tipo.codigo} · {tipo.nombre}</p>}
      </div>
      {aviso}
      {f.estado === "anulada" && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Anulada: {f.motivo_anulacion}</p>
      )}

      <div className="flex flex-wrap items-start gap-2">
        {fc && Number(fc.saldo) > 0 && (
          <Link href={`/oficina/cobros/nuevo?factura=${f.id}`} className="boton boton-chico">
            <Icono nombre="cobros" tam={14} /> Registrar cobro
          </Link>
        )}
        <a href={`/f/${f.token}/pdf`} target="_blank" rel="noopener noreferrer" className="boton-sec boton-chico">
          <Icono nombre="descargar" tam={14} /> PDF
        </a>
        <a href={`/f/${f.token}/ticket`} target="_blank" rel="noopener noreferrer" className="boton-sec boton-chico">
          <Icono nombre="imprimir" tam={14} /> Ticket
        </a>
        <a href={`/f/${f.token}`} target="_blank" rel="noopener noreferrer" className="boton-sec boton-chico">Ver como el cliente</a>
        {f.estado === "emitida" && <CopiarEnlace url={enlace} />}
        {f.estado === "emitida" && wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="boton-sec boton-chico">Enviar por WhatsApp</a>
        )}
        {f.estado === "emitida" && f.tipo_doc === "factura" && <HacerNotaCredito id={f.id} />}
        {f.estado === "emitida" && f.tipo_doc === "proforma" && !facturaDeProforma && (
          <ConvertirProforma
            id={f.id}
            tipos={(await supabase.from("tipos_comprobante").select("*").order("codigo")).data as TipoComprobante[]}
            sugerido={cli?.tipo_comprobante ?? (cli?.rnc?.trim() ? "B01" : "B02")}
          />
        )}
        {f.estado === "emitida" && ncActivas.length === 0 && !(fc && Number(fc.cobrado) > 0) && !["enviado", "aceptado", "condicional"].includes(f.estado_ecf) && (
          <Anular id={f.id} ncf={numero} />
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <section className="tarjeta grid gap-4 p-4 text-sm sm:grid-cols-2">
            <div>
              <div className="etiqueta">Cliente</div>
              <Link href={`/oficina/clientes/${f.cliente_id}`} className="font-medium hover:underline">{f.razon_social ?? f.cliente_nombre}</Link>
              {f.razon_social && f.cliente_nombre && f.razon_social !== f.cliente_nombre && (
                <div className="text-stone-500">{f.cliente_nombre}</div>
              )}
              <div className="text-stone-500">{f.rnc ? `RNC/Cédula ${f.rnc}` : "Sin RNC"}</div>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-stone-500">Fecha</dt>
              <dd>{fechaSimple(f.fecha)}</dd>
              {f.vence && (
                <>
                  <dt className="text-stone-500">{f.tipo_doc === "proforma" ? "Válida hasta" : "Vence el pago"}</dt>
                  <dd>{fechaSimple(f.vence)}</dd>
                </>
              )}
              {f.ncf_vence && (
                <>
                  <dt className="text-stone-500">NCF válido hasta</dt>
                  <dd>{fechaSimple(f.ncf_vence)}</dd>
                </>
              )}
              {ref && (
                <>
                  <dt className="text-stone-500">Modifica</dt>
                  <dd><Link href={`/oficina/facturacion/${ref.id}`} className="text-marca-700 hover:underline">{ref.ncf}</Link></dd>
                </>
              )}
              {prof && (
                <>
                  <dt className="text-stone-500">Proforma</dt>
                  <dd><Link href={`/oficina/facturacion/${prof.id}`} className="text-marca-700 hover:underline">{prof.numero_proforma}</Link></dd>
                </>
              )}
            </dl>
          </section>

          <section className="tarjeta overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-stone-50 text-left text-xs text-stone-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Descripción</th>
                  <th className="px-2 py-2 text-right font-medium">Cant.</th>
                  <th className="px-2 py-2 text-right font-medium">Precio</th>
                  <th className="px-2 py-2 text-right font-medium">Desc.</th>
                  <th className="px-2 py-2 text-right font-medium">ITBIS</th>
                  <th className="px-4 py-2 text-right font-medium">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 tabular-nums">
                {lineas.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2">{l.descripcion}</td>
                    <td className="px-2 py-2 text-right">{Number(l.cantidad)}</td>
                    <td className="px-2 py-2 text-right">{monto(l.precio, f.moneda)}</td>
                    <td className="px-2 py-2 text-right">{Number(l.descuento) ? monto(l.descuento, f.moneda) : "—"}</td>
                    <td className="px-2 py-2 text-right">{Number(l.itbis_tasa) ? monto(l.itbis, f.moneda) : "Exento"}</td>
                    <td className="px-4 py-2 text-right">{monto(l.subtotal, f.moneda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          {f.notas && <p className="text-sm text-stone-600">{f.notas}</p>}
        </div>

        <aside className="space-y-4">
          <div className="tarjeta space-y-2 p-4 text-sm">
            <dl className="grid grid-cols-[1fr_auto] gap-y-1 tabular-nums">
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
                  <dt className="text-xs text-stone-500">En pesos (tasa {Number(f.tasa_cambio)})</dt>
                  <dd className="text-right text-xs text-stone-500">{monto(Number(f.total) * Number(f.tasa_cambio))}</dd>
                </>
              )}
              {fc && (
                <>
                  <dt className="text-stone-500">Cobrado</dt>
                  <dd className="text-right text-marca-700">{monto(fc.cobrado, f.moneda)}</dd>
                  {Number(fc.acreditado) > 0 && (
                    <>
                      <dt className="text-stone-500">Notas de crédito</dt>
                      <dd className="text-right text-marca-700">{monto(fc.acreditado, f.moneda)}</dd>
                    </>
                  )}
                  <dt className="font-bold">Saldo</dt>
                  <dd className={`text-right font-display text-lg font-semibold ${Number(fc.saldo) > 0 ? "text-orange-700" : "text-marca-700"}`}>{monto(fc.saldo, f.moneda)}</dd>
                </>
              )}
              {f.tipo_doc === "nota_credito" && f.estado === "emitida" && (
                <>
                  <dt className="text-stone-500">Rebajó de la factura</dt>
                  <dd className="text-right">{monto(f.nc_aplicada, f.moneda)}</dd>
                  {Number(f.total) - Number(f.nc_aplicada ?? 0) > 0 && (
                    <>
                      <dt className="col-span-2 pt-1 text-xs text-stone-600">
                        {monto(Number(f.total) - Number(f.nc_aplicada ?? 0), f.moneda)}: {TEXTO_REEMBOLSO[f.reembolso ?? "saldo"].toLowerCase()}
                      </dt>
                    </>
                  )}
                </>
              )}
            </dl>
          </div>
          {pagosFactura.length > 0 && (
            <div className="tarjeta space-y-2 p-4 text-sm">
              <h2 className="subtitulo">Pagos recibidos</h2>
              <ul className="space-y-1">
                {pagosFactura.map((p) => (
                  <li key={p.cobros.id} className="flex justify-between gap-2">
                    <Link href={`/oficina/cobros/${p.cobros.id}`} className="text-marca-700 hover:underline">
                      {p.cobros.numero}{" "}
                      <span className="text-xs text-stone-500">
                        · {fechaSimple(p.cobros.fecha)} · {[...new Set(p.cobros.cobro_pagos.map((x) => TEXTO_FORMA[x.forma]))].join(" + ")}
                      </span>
                    </Link>
                    <span className="tabular-nums">{monto(p.monto, f.moneda)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {relacionados.length > 0 && (
            <div className="tarjeta space-y-2 p-4 text-sm">
              <h2 className="subtitulo">Documentos relacionados</h2>
              <ul className="space-y-1">
                {relacionados.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <Link href={`/oficina/facturacion/${r.id}`} className="text-marca-700 hover:underline">
                      {NOMBRE_DOC[r.tipo_doc]} {numeroDocumento(r)}
                    </Link>
                    <span className="tabular-nums text-stone-500">{r.estado === "anulada" ? "anulada" : monto(r.total, f.moneda)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
