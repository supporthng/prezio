import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { leerFactura, tituloDocumento } from "@/lib/factura-publica";
import { monto as montoMoneda, numeroDocumento, TEXTO_ECF } from "@/lib/facturacion";

const numeroPlano = (v: number | string | null | undefined) =>
  new Intl.NumberFormat("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v ?? 0));
import { fechaSimple } from "@/lib/formato";

const VERDE = rgb(0.106, 0.384, 0.227);
const GRIS = rgb(0.38, 0.42, 0.4);
const LINEA = rgb(0.86, 0.89, 0.87);
const TEXTO = rgb(0.11, 0.14, 0.13);
const FONDO = rgb(0.96, 0.97, 0.96);

/** Las fuentes estándar del PDF no tienen emojis ni algunos símbolos */
const limpio = (t: string | null | undefined) =>
  (t ?? "")
    .normalize("NFC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/−/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF–—•…€]/g, "");

function partir(texto: string, fuente: PDFFont, tam: number, ancho: number): string[] {
  const lineas: string[] = [];
  for (const parrafo of limpio(texto).split(/\n/)) {
    let linea = "";
    for (const palabra of parrafo.split(/\s+/)) {
      const prueba = linea ? `${linea} ${palabra}` : palabra;
      if (fuente.widthOfTextAtSize(prueba, tam) > ancho && linea) {
        lineas.push(linea);
        linea = palabra;
      } else linea = prueba;
    }
    lineas.push(linea);
  }
  return lineas;
}

export async function GET(_req: Request, { params }: RouteContext<"/f/[token]/pdf">) {
  const { token } = await params;
  const d = await leerFactura(token);
  if (!d) return new Response("Documento no encontrado", { status: 404 });
  const f = d.factura;
  const e = d.empresa;
  const numero = numeroDocumento(f);
  const titulo = tituloDocumento(d);
  const monto = (v: number | string | null | undefined) => montoMoneda(v, f.moneda);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${titulo} ${numero}`);
  pdf.setAuthor(limpio(e?.nombre));
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ANCHO = 612;
  const ALTO = 792;
  const M = 48;
  let pagina: PDFPage = pdf.addPage([ANCHO, ALTO]);
  let y = ALTO - M;

  const escribir = (t: string, x: number, tam = 10, fuente = normal, color = TEXTO) =>
    pagina.drawText(limpio(t), { x, y, size: tam, font: fuente, color });
  const derecha = (t: string, xDer: number, tam = 10, fuente = normal, color = TEXTO) =>
    pagina.drawText(limpio(t), { x: xDer - fuente.widthOfTextAtSize(limpio(t), tam), y, size: tam, font: fuente, color });

  // Columnas de la tabla
  const C = { desc: M + 6, cant: 340, precio: 420, itbis: 490, importe: ANCHO - M - 6 };
  const encabezadoTabla = () => {
    pagina.drawRectangle({ x: M, y: y - 6, width: ANCHO - 2 * M, height: 20, color: FONDO });
    escribir("Descripción", C.desc, 9, negrita, GRIS);
    derecha("Cant.", C.cant, 9, negrita, GRIS);
    derecha("Precio", C.precio, 9, negrita, GRIS);
    derecha("ITBIS", C.itbis, 9, negrita, GRIS);
    derecha("Importe", C.importe, 9, negrita, GRIS);
    y -= 22;
  };
  const asegurar = (alto: number, conTabla = false) => {
    if (y - alto < 50) {
      pagina = pdf.addPage([ANCHO, ALTO]);
      y = ALTO - M;
      if (conTabla) encabezadoTabla();
    }
  };

  // ---- Empresa (izquierda) y documento (derecha) ----
  pagina.drawRectangle({ x: 0, y: ALTO - 6, width: ANCHO, height: 6, color: VERDE });
  const yInicio = y;
  escribir(e?.nombre ?? "", M, 16, negrita, VERDE);
  y -= 15;
  for (const l of [
    e?.rnc && `RNC ${e.rnc}`,
    [e?.telefono && `Tel. ${e.telefono}`, e?.correo].filter(Boolean).join("  ·  "),
    e?.direccion,
  ]) {
    if (!l) continue;
    for (const p of partir(l, normal, 9, 290)) {
      escribir(p, M, 9, normal, GRIS);
      y -= 12;
    }
  }
  const yIzq = y;

  y = yInicio;
  const XD = ANCHO - M;
  derecha(titulo.toUpperCase(), XD, 10, negrita, TEXTO);
  y -= 16;
  derecha(f.ncf ? `NCF ${numero}` : numero, XD, 13, negrita, TEXTO);
  y -= 14;
  if (f.ncf_vence) {
    derecha(`Válido hasta ${fechaSimple(f.ncf_vence)}`, XD, 9, normal, GRIS);
    y -= 12;
  }
  derecha(`Fecha ${fechaSimple(f.fecha)}`, XD, 9, normal, GRIS);
  y -= 12;
  y = Math.min(y, yIzq) - 14;
  pagina.drawLine({ start: { x: M, y }, end: { x: ANCHO - M, y }, thickness: 0.8, color: LINEA });
  y -= 20;

  // ---- Cliente ----
  const yCliente = y;
  escribir("CLIENTE", M, 8, negrita, VERDE);
  y -= 14;
  for (const p of partir(f.razon_social ?? f.cliente_nombre ?? "", negrita, 11, 300)) {
    escribir(p, M, 11, negrita);
    y -= 14;
  }
  if (f.razon_social && f.cliente_nombre && f.razon_social !== f.cliente_nombre) {
    escribir(f.cliente_nombre, M, 9, normal, GRIS);
    y -= 12;
  }
  if (f.rnc) {
    escribir(`RNC/Cédula ${f.rnc}`, M, 9, normal, GRIS);
    y -= 12;
  }
  const yCli = y;
  y = yCliente - 14;
  const datos: [string, string][] = [];
  if (d.referencia_ncf) datos.push(["NCF modificado", d.referencia_ncf]);
  if (f.tipo_doc === "factura") datos.push(["Condición", f.dias_credito ? `Crédito ${f.dias_credito} días` : "Contado"]);
  if (f.vence) datos.push([f.tipo_doc === "proforma" ? "Válida hasta" : "Fecha de pago", fechaSimple(f.vence)]);
  for (const [k, v] of datos) {
    derecha(v, XD, 10, normal, TEXTO);
    derecha(k, XD - 110, 9, negrita, GRIS);
    y -= 14;
  }
  y = Math.min(y, yCli) - 16;

  // ---- Líneas ----
  encabezadoTabla();
  for (const l of d.lineas) {
    const desc = partir(l.descripcion, normal, 10, C.cant - C.desc - 50);
    const extra = Number(l.descuento) > 0 ? 1 : 0;
    asegurar((desc.length + extra) * 12 + 8, true);
    derecha(String(Number(l.cantidad)), C.cant);
    derecha(numeroPlano(l.precio), C.precio);
    derecha(Number(l.itbis_tasa) ? numeroPlano(l.itbis) : "Exento", C.itbis);
    derecha(numeroPlano(l.subtotal), C.importe);
    for (const [i, t] of desc.entries()) {
      if (i > 0) y -= 12;
      escribir(t, C.desc);
    }
    if (extra) {
      y -= 12;
      escribir(`Descuento ${monto(l.descuento)}`, C.desc, 8, normal, GRIS);
    }
    y -= 8;
    pagina.drawLine({ start: { x: M, y }, end: { x: ANCHO - M, y }, thickness: 0.5, color: LINEA });
    y -= 14;
  }

  // ---- Totales ----
  const totales: [string, string, boolean][] = [["Subtotal", monto(f.subtotal), false]];
  if (Number(f.descuento) > 0) totales.push(["Descuento", `- ${monto(f.descuento)}`, false]);
  totales.push(["ITBIS", monto(f.itbis), false]);
  totales.push(["Total", monto(f.total), true]);
  if (f.moneda && f.moneda !== "DOP") totales.push([`Tasa ${Number(f.tasa_cambio)} · RD$`, numeroPlano(Number(f.total) * Number(f.tasa_cambio)), false]);
  for (const p of d.pagos ?? []) totales.push([`Pagado`, monto(p.monto), false]);
  if ((d.pagos?.length ?? 0) > 0 && f.tipo_doc === "factura") totales.push(["Saldo pendiente", monto(d.saldo ?? 0), false]);
  asegurar(totales.length * 16 + 10);
  y -= 4;
  for (const [k, v, fuerte] of totales) {
    if (fuerte) {
      pagina.drawLine({ start: { x: 380, y: y + 12 }, end: { x: ANCHO - M, y: y + 12 }, thickness: 0.8, color: LINEA });
      y -= 4;
    }
    escribir(k, 390, fuerte ? 12 : 10, fuerte ? negrita : normal, fuerte ? TEXTO : GRIS);
    derecha(v, C.importe, fuerte ? 12 : 10, fuerte ? negrita : normal);
    y -= 16;
  }

  // ---- Notas ----
  const notas = [
    f.notas,
    f.tipo_doc === "proforma" ? "Documento sin valor fiscal. La factura con comprobante se emite al confirmar el servicio." : null,
    f.estado_ecf !== "no_aplica" && f.estado_ecf !== "aceptado" ? `Comprobante fiscal electrónico · ${TEXTO_ECF[f.estado_ecf].toLowerCase()}.` : null,
  ].filter(Boolean) as string[];
  if (notas.length) y -= 10;
  for (const n of notas) {
    for (const l of partir(n, normal, 9, ANCHO - 2 * M)) {
      asegurar(12);
      escribir(l, M, 9, normal, GRIS);
      y -= 12;
    }
    y -= 4;
  }

  // ---- Anulada y pie ----
  for (const [i, p] of pdf.getPages().entries()) {
    if (f.estado === "anulada") {
      p.drawText("ANULADA", { x: 150, y: 330, size: 90, font: negrita, color: rgb(0.85, 0.2, 0.2), opacity: 0.15, rotate: degrees(25) });
    }
    p.drawText(limpio(`${titulo} ${numero} · Página ${i + 1} de ${pdf.getPageCount()}`), { x: M, y: 24, size: 8, font: normal, color: GRIS });
  }

  const bytes = await pdf.save();
  const nombre = `${limpio(titulo)} ${numero} - ${limpio(f.razon_social ?? f.cliente_nombre)}.pdf`;
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
