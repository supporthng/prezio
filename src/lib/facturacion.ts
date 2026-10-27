import type { NombreIcono } from "@/components/Icono";
import type { EstadoDocumento, EstadoEcf, EstadoPago, Factura, FormaPago, LineaFactura, Reembolso, TipoDocumento } from "./tipos";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Cálculo igual al de la base de datos */
export function calcularLinea(l: Pick<LineaFactura, "cantidad" | "precio" | "descuento" | "itbis_tasa">) {
  const neto = (Number(l.cantidad) || 0) * (Number(l.precio) || 0) - (Number(l.descuento) || 0);
  return { subtotal: r2(neto), itbis: r2((neto * (Number(l.itbis_tasa) || 0)) / 100) };
}

export function calcularTotales(lineas: Pick<LineaFactura, "cantidad" | "precio" | "descuento" | "itbis_tasa">[]) {
  let bruto = 0;
  let descuento = 0;
  let neto = 0;
  let itbis = 0;
  for (const l of lineas) {
    const c = calcularLinea(l);
    bruto += r2((Number(l.cantidad) || 0) * (Number(l.precio) || 0));
    descuento += Number(l.descuento) || 0;
    neto += c.subtotal;
    itbis += c.itbis;
  }
  return { subtotal: r2(bruto), descuento: r2(descuento), neto: r2(neto), itbis: r2(itbis), total: r2(neto + itbis) };
}

export const NOMBRE_DOC: Record<TipoDocumento, string> = {
  proforma: "Proforma",
  factura: "Factura",
  nota_credito: "Nota de crédito",
};

/** Número que se muestra: NCF, PRO-00001 o «Borrador» */
export function numeroDocumento(f: Pick<Factura, "ncf" | "numero_proforma" | "estado">) {
  return f.ncf ?? f.numero_proforma ?? (f.estado === "borrador" ? "Borrador" : "—");
}

export function chipEstado(estado: EstadoDocumento, vence: string | null, hoy: string, tipo: TipoDocumento) {
  if (estado === "borrador") return { texto: "Borrador", clase: "bg-stone-100 text-stone-700" };
  if (estado === "anulada") return { texto: "Anulada", clase: "bg-red-50 text-red-700" };
  if (tipo === "factura" && vence && vence < hoy) return { texto: "Vencida", clase: "bg-amber-50 text-amber-800" };
  return { texto: "Emitida", clase: "bg-marca-50 text-marca-800" };
}

export const TEXTO_ECF: Record<EstadoEcf, string> = {
  no_aplica: "",
  pendiente: "Pendiente de envío a la DGII",
  enviado: "Enviado a la DGII",
  aceptado: "Aceptado por la DGII",
  condicional: "Aceptado condicional",
  rechazado: "Rechazado por la DGII",
};

export const TASAS_ITBIS = [
  { valor: 18, texto: "18 %" },
  { valor: 16, texto: "16 %" },
  { valor: 0, texto: "Exento" },
];

export type Moneda = "DOP" | "USD" | "EUR";

export const MONEDAS: { valor: Moneda; texto: string; simbolo: string }[] = [
  { valor: "DOP", texto: "Pesos dominicanos", simbolo: "RD$" },
  { valor: "USD", texto: "Dólares", simbolo: "US$" },
  { valor: "EUR", texto: "Euros", simbolo: "€" },
];

export const simbolo = (m?: string | null) => MONEDAS.find((x) => x.valor === m)?.simbolo ?? "RD$";

/** Montos de factura: siempre con dos decimales y el símbolo de su moneda */
export function monto(valor: number | string | null | undefined, moneda?: string | null): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  return `${simbolo(moneda)} ${new Intl.NumberFormat("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(valor))}`;
}

export const FORMAS_PAGO: { valor: FormaPago; texto: string; icono: NombreIcono; referencia?: string }[] = [
  { valor: "efectivo", texto: "Efectivo", icono: "efectivo" },
  { valor: "transferencia", texto: "Transferencia", icono: "transferencia", referencia: "Banco y número" },
  { valor: "tarjeta", texto: "Tarjeta", icono: "tarjeta", referencia: "Últimos 4 dígitos" },
  { valor: "cheque", texto: "Cheque", icono: "cheque", referencia: "Banco y número" },
  { valor: "saldo_favor", texto: "Saldo a favor", icono: "favor" },
];

export const TEXTO_FORMA: Record<FormaPago, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  cheque: "Cheque",
  saldo_favor: "Saldo a favor",
  otro: "Otro",
};

export const TEXTO_REEMBOLSO: Record<Reembolso, string> = {
  saldo: "Queda como saldo a favor del cliente",
  efectivo: "Se devuelve en efectivo",
  transferencia: "Se devuelve por transferencia",
  cheque: "Se devuelve con cheque",
  tarjeta: "Se reversa a la tarjeta",
};

export function chipPago(estado: EstadoPago, diasVencida = 0) {
  switch (estado) {
    case "pagada":
      return { texto: "Pagada", clase: "bg-marca-50 text-marca-700" };
    case "parcial":
      return { texto: "Abonada", clase: "bg-sky-50 text-sky-800" };
    case "vencida":
      return { texto: diasVencida ? `Vencida ${diasVencida} d` : "Vencida", clase: "bg-orange-50 text-orange-800" };
    default:
      return { texto: "Por cobrar", clase: "bg-amber-50 text-amber-800" };
  }
}

/** Montos redondos para indicadores: RD$ 412,300 */
export function montoEntero(valor: number | string | null | undefined): string {
  return `RD$ ${new Intl.NumberFormat("es-DO", { maximumFractionDigits: 0 }).format(Math.round(Number(valor ?? 0)))}`;
}
