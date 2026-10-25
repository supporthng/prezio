/** Apariencia de la pantalla del verificador (negocios.apariencia). Misma lógica que el sistema actual:
 *  cinco estilos y un color del negocio que se ajusta para que precio y textos siempre se lean. */

export const ESTILOS = {
  claro: { nombre: "Claro", detalle: "Fondo blanco, precio en el color del negocio." },
  noche: { nombre: "Noche", detalle: "Fondo oscuro, ideal para pantallas grandes." },
  marca: { nombre: "Color del negocio", detalle: "Toda la pantalla en el color del negocio." },
  etiqueta: { nombre: "Etiqueta de góndola", detalle: "El precio en una etiqueta amarilla, como en el estante." },
  panel: { nombre: "Panel lateral", detalle: "Franja con logo, nombre y QR; el precio al lado." },
} as const;
export type Estilo = keyof typeof ESTILOS;

export type Apariencia = {
  estilo: Estilo;
  color_marca: string;
  posicion_logo: "esquina" | "centro";
  mostrar_nombre: boolean;
  mostrar_sucursal: boolean;
  mostrar_logo: boolean;
  mostrar_qr: boolean;
  titulo_espera: string;
  mensaje_espera: string;
  texto_qr: string;
  segundos: number;
  logo: string | null;   // dirección pública (Supabase Storage) con ?v= para refrescar
  qr: string | null;
};

export const PREDETERMINADA: Apariencia = {
  estilo: "claro",
  color_marca: "#0757d4",
  posicion_logo: "esquina",
  mostrar_nombre: true,
  mostrar_sucursal: true,
  mostrar_logo: true,
  mostrar_qr: true,
  titulo_espera: "Escanea tu producto",
  mensaje_espera: "Pasa el código de barras por el lector",
  texto_qr: "Consulta también desde tu celular",
  segundos: 10,
  logo: null,
  qr: null,
};

const LARGOS = { titulo_espera: 60, mensaje_espera: 90, texto_qr: 60 } as const;

export function normalizar(entrada: unknown): Apariencia {
  const a = (entrada && typeof entrada === "object" ? entrada : {}) as Record<string, unknown>;
  const r: Apariencia = { ...PREDETERMINADA };
  if (typeof a.estilo === "string" && a.estilo in ESTILOS) r.estilo = a.estilo as Estilo;
  if (typeof a.color_marca === "string" && /^#[0-9a-f]{6}$/i.test(a.color_marca)) r.color_marca = a.color_marca.toLowerCase();
  if (a.posicion_logo === "centro") r.posicion_logo = "centro";
  for (const k of ["mostrar_nombre", "mostrar_sucursal", "mostrar_logo", "mostrar_qr"] as const) {
    if (typeof a[k] === "boolean") r[k] = a[k] as boolean;
  }
  for (const k of Object.keys(LARGOS) as (keyof typeof LARGOS)[]) {
    const t = typeof a[k] === "string" ? (a[k] as string).replace(/\s+/g, " ").trim().slice(0, LARGOS[k]) : "";
    if (t) r[k] = t;
  }
  const s = Number(a.segundos);
  if (Number.isFinite(s)) r.segundos = Math.min(30, Math.max(4, Math.round(s)));
  for (const k of ["logo", "qr"] as const) {
    if (typeof a[k] === "string" && /^https:\/\//.test(a[k] as string)) r[k] = a[k] as string;
  }
  return r;
}

// ---------------------------------------------------------------- colores siempre legibles
const TINTA = "#0f2440", BLANCO = "#ffffff";
const FONDO: Partial<Record<Estilo, string>> = { claro: "#ffffff", noche: "#10213d", etiqueta: "#ffffff" };

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const hex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
function luminancia(color: string) {
  const c = rgb(color).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contraste(a: string, b: string) {
  const x = luminancia(a), y = luminancia(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function mezclar(a: string, b: string, t: number) {
  const x = rgb(a), y = rgb(b);
  return hex(x.map((v, i) => v + (y[i] - v) * t));
}
/** Acerca un poco el color hacia oscuro o claro hasta que se lea; si no alcanza, usa el texto normal. */
export function legible(color: string, fondo: string, minimo: number) {
  const hacia = luminancia(fondo) > 0.4 ? TINTA : BLANCO;
  for (let t = 0; t <= 0.1501; t += 0.05) {
    const c = mezclar(color, hacia, t);
    if (contraste(c, fondo) >= minimo) return c;
  }
  return hacia;
}
const sobre = (fondo: string) => (contraste(BLANCO, fondo) >= contraste(TINTA, fondo) ? BLANCO : TINTA);

/** Variables CSS de la pantalla para un estilo y color. */
export function variables(a: Apariencia): Record<string, string> {
  const e = a.estilo, marca = a.color_marca;
  const fondo = e === "marca" ? marca : (FONDO[e] ?? BLANCO);
  const tinta = e === "marca" ? sobre(marca) : (e === "noche" ? "#f3f6fb" : TINTA);
  return {
    "--pz-marca": marca,
    "--pz-sobre-marca": sobre(marca),
    "--pz-papel": fondo,
    "--pz-tinta": tinta,
    "--pz-gris": e === "marca" ? mezclar(tinta, fondo, 0.3) : (e === "noche" ? "#9fb0c8" : "#6b7a90"),
    "--pz-linea": e === "marca" ? mezclar(tinta, fondo, 0.78) : (e === "noche" ? "#24395c" : "#e6ebf2"),
    "--pz-precio": e === "marca" ? tinta : (e === "etiqueta" ? TINTA : legible(marca, fondo, e === "noche" ? 4.5 : 3)),
    "--pz-acento": e === "marca" ? tinta : legible(marca, fondo, 2.2),
  };
}
