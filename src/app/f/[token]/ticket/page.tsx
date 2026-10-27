import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { leerFactura, tituloDocumento } from "@/lib/factura-publica";
import { numeroDocumento, simbolo, TEXTO_FORMA } from "@/lib/facturacion";
import { fechaSimple, horaRD } from "@/lib/formato";
import { ImprimirAlAbrir } from "./Imprimir";

export const metadata: Metadata = { title: "Ticket", robots: { index: false, follow: false } };

const n2 = (v: number | string | null | undefined) =>
  new Intl.NumberFormat("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v ?? 0));

/** Ticket para impresora térmica de 80 mm */
export default async function Ticket({ params }: PageProps<"/f/[token]/ticket">) {
  const { token } = await params;
  const d = await leerFactura(token);
  if (!d) notFound();
  const f = d.factura;
  const e = d.empresa;
  const pagos = d.pagos ?? [];
  const cambio = pagos.reduce((m, p) => Math.max(m, Number(p.cambio ?? 0)), 0);
  const saldo = Number(d.saldo ?? 0);

  return (
    <>
      <style>{`
        @page { size: 80mm auto; margin: 0; }
        html, body { background: #fff !important; }
        .ticket { width: 72mm; margin: 0 auto; padding: 4mm 0 8mm; font-family: "Manrope Variable", Arial, sans-serif; font-size: 11.5px; line-height: 1.35; color: #000; }
        .ticket .c { text-align: center; }
        .ticket .r { text-align: right; }
        .ticket .b { font-weight: 800; }
        .ticket hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
        .ticket .fila { display: flex; justify-content: space-between; gap: 8px; }
        .ticket .grande { font-size: 15px; font-weight: 800; }
        .ticket .anulada { border: 2px solid #000; padding: 4px; text-align: center; font-weight: 800; letter-spacing: 2px; margin: 6px 0; }
        @media print { .no-imprimir { display: none !important; } }
        @media screen { body { background: #eef2ef !important; } .ticket { background: #fff; padding: 6mm 4mm 10mm; margin: 12px auto; box-shadow: 0 4px 20px rgba(0,0,0,.12); } }
      `}</style>
      <ImprimirAlAbrir />
      <div className="ticket">
        <div className="c">
          <div className="grande">{e?.nombre}</div>
          {e?.rnc && <div>RNC {e.rnc}</div>}
          {e?.direccion && <div>{e.direccion}</div>}
          {e?.telefono && <div>Tel. {e.telefono}</div>}
        </div>
        <hr />
        <div className="c b">{tituloDocumento(d).toUpperCase()}</div>
        <div className="c b">{f.ncf ? `NCF ${numeroDocumento(f)}` : numeroDocumento(f)}</div>
        {f.ncf_vence && <div className="c">Válido hasta {fechaSimple(f.ncf_vence)}</div>}
        <div className="c">
          {fechaSimple(f.fecha)}
          {f.emitida_en ? ` · ${horaRD(f.emitida_en)}` : ""}
        </div>
        {f.estado === "anulada" && <div className="anulada">ANULADA</div>}
        <hr />
        <div>
          <span className="b">Cliente:</span> {f.razon_social ?? f.cliente_nombre}
        </div>
        {f.rnc && <div>RNC/Céd.: {f.rnc}</div>}
        {d.referencia_ncf && <div>NCF modificado: {d.referencia_ncf}</div>}
        <hr />
        {d.lineas.map((l, i) => (
          <div key={i} style={{ marginBottom: 4 }}>
            <div>{l.descripcion}</div>
            <div className="fila">
              <span>
                {Number(l.cantidad)} x {n2(l.precio)}
                {Number(l.descuento) > 0 ? ` - ${n2(l.descuento)}` : ""}
                {Number(l.itbis_tasa) ? "" : " (E)"}
              </span>
              <span>{n2(l.subtotal)}</span>
            </div>
          </div>
        ))}
        <hr />
        <div className="fila"><span>Subtotal</span><span>{n2(Number(f.subtotal) - Number(f.descuento))}</span></div>
        <div className="fila"><span>ITBIS</span><span>{n2(f.itbis)}</span></div>
        <div className="fila grande"><span>TOTAL {simbolo(f.moneda)}</span><span>{n2(f.total)}</span></div>
        {f.moneda && f.moneda !== "DOP" && (
          <div className="fila"><span>Tasa {Number(f.tasa_cambio)}</span><span>RD$ {n2(Number(f.total) * Number(f.tasa_cambio))}</span></div>
        )}
        {pagos.length > 0 && (
          <>
            <hr />
            {pagos.map((p, i) => (
              <div key={i} className="fila"><span>{TEXTO_FORMA[p.forma]}</span><span>{n2(p.monto)}</span></div>
            ))}
            {cambio > 0 && <div className="fila b"><span>Cambio</span><span>{n2(cambio)}</span></div>}
          </>
        )}
        {f.tipo_doc === "factura" && saldo > 0 && (
          <>
            <hr />
            <div className="fila b"><span>Pendiente</span><span>{n2(saldo)}</span></div>
            {f.vence && <div>Fecha de pago: {fechaSimple(f.vence)}</div>}
          </>
        )}
        <hr />
        {f.notas && <div style={{ marginBottom: 4 }}>{f.notas}</div>}
        <div className="c">{e?.mensaje_ticket || "¡Gracias por preferirnos!"}</div>
        {f.estado_ecf !== "no_aplica" && f.estado_ecf !== "aceptado" && <div className="c" style={{ fontSize: 10, marginTop: 4 }}>e-CF pendiente de validación DGII</div>}
      </div>
    </>
  );
}
