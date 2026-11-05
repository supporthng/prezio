/** Ofertas en la pantalla del verificador. La misma regla que la base (oferta_vigente / oferta_de), para que el
 *  verificador sin internet decida solo cuáles mostrar y qué precio dar. */

export type TipoOferta = "precio" | "porcentaje" | "lleva_paga" | "aviso";
/** [código, nombre, precio normal, precio de oferta (solo «precio especial»)] */
export type ProductoOferta = [string, string, number | string, number | string | null];
export type Oferta = {
  id: string; nombre: string; descripcion: string | null; tipo: TipoOferta; valor: number | string | null;
  lleva: number | null; paga: number | null; imagen: string | null;
  desde: string | null; hasta: string | null; dias: number[] | null; hora_desde: string | null; hora_hasta: string | null;
  productos: ProductoOferta[];
};
/** Lo que se muestra al escanear un producto en oferta. */
export type OfertaProducto = { nombre: string; tipo: TipoOferta; texto: string; precio_oferta: number | null };

const minutos = (h: string) => { const [a, b] = h.split(":").map(Number); return a * 60 + (b || 0); };

/** ¿Vigente en este momento? (días y horas en la hora local del equipo, que está en la tienda) */
export function vigente(o: Oferta, ahora: Date): boolean {
  const t = ahora.getTime();
  if (o.desde && t < Date.parse(o.desde)) return false;
  if (o.hasta && t >= Date.parse(o.hasta)) return false;
  if (o.dias && o.dias.length && !o.dias.includes(ahora.getDay())) return false;
  const m = ahora.getHours() * 60 + ahora.getMinutes();
  if (o.hora_desde && m < minutos(o.hora_desde)) return false;
  if (o.hora_hasta && m >= minutos(o.hora_hasta)) return false;
  return true;
}

export function precioConOferta(o: Pick<Oferta, "tipo" | "valor">, precio: number, especial: number | string | null): number | null {
  if (o.tipo === "precio") { const e = especial === null ? NaN : Number(especial); return Number.isFinite(e) && e < precio ? e : null; }
  if (o.tipo === "porcentaje") return Math.round(precio * (100 - Number(o.valor)) ) / 100;
  return null;
}

export function textoOferta(o: Pick<Oferta, "tipo" | "valor" | "lleva" | "paga" | "nombre">): string {
  if (o.tipo === "lleva_paga") return `Lleva ${o.lleva}, paga ${o.paga}`;
  if (o.tipo === "porcentaje") return `${Number(o.valor)}% de descuento`;
  return o.nombre;
}

/** La mejor oferta vigente de un producto (la que deja el precio más bajo; si ninguna lo baja, la primera). */
export function ofertaDe(ofertas: Oferta[], codigo: string, precio: number, ahora: Date): OfertaProducto | null {
  let mejor: { o: Oferta; p: number | null } | null = null;
  for (const o of ofertas) {
    if (o.tipo === "aviso" || !vigente(o, ahora)) continue;
    const prod = o.productos.find((x) => x[0] === codigo);
    if (!prod) continue;
    const p = precioConOferta(o, precio, prod[3]);
    if (!mejor || (p ?? precio) < (mejor.p ?? precio)) mejor = { o, p };
  }
  return mejor ? { nombre: mejor.o.nombre, tipo: mejor.o.tipo, texto: textoOferta(mejor.o), precio_oferta: mejor.p } : null;
}

/** «Hasta el 30 nov», «Sáb. y dom.», «De 4:00 p. m. a 7:00 p. m.»… para el carrusel. */
const DIAS = ["dom.", "lun.", "mar.", "mié.", "jue.", "vie.", "sáb."];
export function cuandoOferta(o: Oferta): string {
  const partes: string[] = [];
  if (o.dias && o.dias.length && o.dias.length < 7) {
    const d = [...o.dias].sort().map((x) => DIAS[x]);
    partes.push(d.length === 1 ? `Solo ${d[0]}` : d.slice(0, -1).join(", ") + " y " + d[d.length - 1]);
  }
  if (o.hora_desde || o.hora_hasta) partes.push(`${o.hora_desde ?? "00:00"} a ${o.hora_hasta ?? "24:00"}`);
  if (o.hasta) partes.push(`hasta el ${new Date(Date.parse(o.hasta) - 1).toLocaleDateString("es-DO", { day: "numeric", month: "short" })}`);
  return partes.join(" · ");
}
