/** Lector de hojas de cálculo en el navegador, sin librerías: Excel (.xlsx) y CSV.
 *  Devuelve la primera hoja como filas de texto. El archivo nunca sale del equipo hasta que se publica. */

import { Zip } from "@/lib/zip";

export type Filas = string[][];

// ---------------------------------------------------------------- utilidades
const decodificador = new TextDecoder("utf-8");

function entidades(t: string): string {
  return t
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function atributo(etiqueta: string, nombre: string): string | null {
  const m = etiqueta.match(new RegExp(`\\s${nombre}="([^"]*)"`));
  return m ? entidades(m[1]) : null;
}

/** Texto de un elemento con «runs» (<t>…</t> repetidos), sin la guía fonética (<rPh>). */
function textoDe(xml: string): string {
  const limpio = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let salida = "";
  for (const m of limpio.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) salida += m[1];
  return entidades(salida);
}

function columna(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, "").toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// ---------------------------------------------------------------- Excel
export async function leerXlsx(buffer: ArrayBuffer): Promise<Filas> {
  let zip: Zip;
  try { zip = new Zip(new Uint8Array(buffer)); } catch { throw new Error("El archivo no es un Excel válido (.xlsx)."); }
  const leer = (ruta: string) => zip.texto(ruta);
  // Primera hoja según el libro (no siempre se llama sheet1.xml).
  let rutaHoja = "xl/worksheets/sheet1.xml";
  const libro = await leer("xl/workbook.xml");
  const relaciones = await leer("xl/_rels/workbook.xml.rels");
  const primera = libro.match(/<sheet\b[^>]*>/);
  if (primera && relaciones) {
    const id = atributo(primera[0], "r:id");
    for (const m of relaciones.matchAll(/<Relationship\b[^>]*>/g)) {
      if (atributo(m[0], "Id") === id) {
        const destino = atributo(m[0], "Target") ?? "";
        rutaHoja = destino.startsWith("/") ? destino.slice(1) : "xl/" + destino.replace(/^\.\//, "");
      }
    }
  }
  const compartidos: string[] = [];
  const textos = await leer("xl/sharedStrings.xml");
  for (const m of textos.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) compartidos.push(textoDe(m[1]));

  const hoja = await leer(rutaHoja);
  if (!hoja) throw new Error("No se encontró la primera hoja del Excel.");
  const filas: Filas = [];
  for (const fila of hoja.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const numero = Number(atributo(fila[1], "r")) || filas.length + 1;
    const valores: string[] = [];
    for (const celda of fila[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = celda[1];
      const interior = celda[2] ?? "";
      const ref = atributo(attrs, "r");
      const tipo = atributo(attrs, "t");
      const col = ref ? columna(ref) : valores.length;
      let valor = "";
      if (tipo === "inlineStr") valor = textoDe(interior);
      else {
        const v = interior.match(/<v>([\s\S]*?)<\/v>/);
        const crudo = v ? entidades(v[1]) : "";
        if (tipo === "s") valor = compartidos[Number(crudo)] ?? "";
        else if (tipo === "b") valor = crudo === "1" ? "VERDADERO" : "FALSO";
        else valor = crudo;
      }
      valores[col] = valor;
    }
    filas[numero - 1] = Array.from(valores, (v) => (v ?? "").trim());
  }
  return Array.from(filas, (f) => f ?? []);
}

// ---------------------------------------------------------------- CSV
export function leerCsv(texto: string): Filas {
  const t = texto.replace(/^﻿/, "");
  const primeraLinea = t.split(/\r?\n/, 1)[0] ?? "";
  const separador = [";", "\t", ","].map((s) => [s, primeraLinea.split(s).length] as const)
    .sort((a, b) => b[1] - a[1])[0][0];
  const filas: Filas = [];
  let fila: string[] = [], campo = "", comillas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (comillas) {
      if (ch === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') comillas = false;
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === separador) { fila.push(campo.trim()); campo = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      fila.push(campo.trim()); filas.push(fila); fila = []; campo = "";
    } else campo += ch;
  }
  if (campo || fila.length) { fila.push(campo.trim()); filas.push(fila); }
  return filas;
}

export async function leerArchivo(archivo: { name: string; arrayBuffer(): Promise<ArrayBuffer> }): Promise<Filas> {
  const buffer = await archivo.arrayBuffer();
  if (/\.csv$|\.txt$/i.test(archivo.name)) return leerCsv(decodificador.decode(buffer));
  if (/\.xls$/i.test(archivo.name)) {
    throw new Error("Ese es un Excel antiguo (.xls). Ábrelo en Excel y guárdalo como .xlsx o .csv.");
  }
  return leerXlsx(buffer);
}

// ---------------------------------------------------------------- columnas y productos
export function normalizar(texto: string): string {
  return texto.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const CLAVES = {
  codigo: ["codigobarra", "codigobarras", "codbarra", "codbarras", "barcode", "codigo", "upc", "ean", "sku"],
  nombre: ["nombredelproducto", "nombre", "descripcion", "producto", "articulo", "detalle", "name"],
  precio: ["precioventa", "preciodeventa", "precio", "pvp", "price", "precio1"],
};

export type Columnas = { encabezado: number; codigo: number; nombre: number; precio: number };

/** Busca la fila de encabezados (en las primeras 40) y las columnas de código, nombre y precio. */
export function detectarColumnas(filas: Filas): Columnas {
  const buscar = (fila: string[], claves: string[]) => {
    const norm = fila.map(normalizar);
    for (const c of claves) { const i = norm.indexOf(c); if (i >= 0) return i; }
    for (const c of claves) { const i = norm.findIndex((x) => x.startsWith(c)); if (i >= 0) return i; }
    return -1;
  };
  for (let r = 0; r < Math.min(40, filas.length); r++) {
    const codigo = buscar(filas[r], CLAVES.codigo);
    if (codigo >= 0) {
      return { encabezado: r, codigo, nombre: buscar(filas[r], CLAVES.nombre), precio: buscar(filas[r], CLAVES.precio) };
    }
  }
  return { encabezado: 0, codigo: 0, nombre: 1, precio: 2 };
}

/** Precio escrito de cualquier forma: «RD$ 1,234.50», «1.234,50», «125», «95.5». */
export function leerPrecio(valor: string): number | null {
  let s = String(valor ?? "").replace(/RD\$|\$|\s/gi, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(".") > s.lastIndexOf(",") ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = (s.split(",").pop() ?? "").length <= 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export type Producto = { codigo: string; nombre: string; precio: number };

/** Productos válidos (con código, nombre y precio), sin repetir códigos (gana el último). */
export function productos(filas: Filas, c: Columnas): { lista: Producto[]; descartados: number } {
  const porCodigo = new Map<string, Producto>();
  let descartados = 0;
  for (const fila of filas.slice(c.encabezado + 1)) {
    if (!fila.some((x) => x)) continue;
    const codigo = String(fila[c.codigo] ?? "").trim().replace(/\.0$/, "");
    const nombre = String(fila[c.nombre] ?? "").trim().slice(0, 200);
    const precio = leerPrecio(fila[c.precio] ?? "");
    if (!codigo || codigo.length > 64 || /^(n\/?d|nan|none|null)$/i.test(codigo) || !nombre || precio === null) {
      descartados++;
      continue;
    }
    porCodigo.set(codigo, { codigo, nombre, precio });
  }
  return { lista: [...porCodigo.values()], descartados };
}
