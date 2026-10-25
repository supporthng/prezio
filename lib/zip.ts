/** Lector de ZIP en el navegador (y en Node 18+), sin librerías: lee el índice central y descomprime
 *  con DecompressionStream. Lo usan el Excel (.xlsx es un ZIP) y la importación del sistema anterior. */

const decodificador = new TextDecoder("utf-8");
type Entrada = { metodo: number; tamano: number; desplazamiento: number };

export type LectorZip = {
  nombres: string[];
  tiene(nombre: string): boolean;
  bytes(nombre: string): Promise<Uint8Array | null>;
  texto(nombre: string): Promise<string>;
};

/** new Zip(datos): misma interfaz que abrirZip, en forma de clase. */
export class Zip implements LectorZip {
  nombres: string[];
  tiene: LectorZip["tiene"];
  bytes: LectorZip["bytes"];
  texto: LectorZip["texto"];
  constructor(datos: ArrayBuffer | Uint8Array) {
    const z = abrirZip(datos);
    this.nombres = z.nombres; this.tiene = z.tiene; this.bytes = z.bytes; this.texto = z.texto;
  }
}

export function abrirZip(buffer: ArrayBuffer | Uint8Array): LectorZip {
  const datos = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const vista = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
  let fin = -1;
  for (let i = datos.length - 22; i >= Math.max(0, datos.length - 66000); i--) {
    if (vista.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw new Error("El archivo no es un ZIP válido.");
  const total = vista.getUint16(fin + 10, true);
  let p = vista.getUint32(fin + 16, true);
  const entradas = new Map<string, Entrada>();
  for (let n = 0; n < total; n++) {
    if (vista.getUint32(p, true) !== 0x02014b50) break;
    const metodo = vista.getUint16(p + 10, true);
    const tamano = vista.getUint32(p + 20, true);
    const largoNombre = vista.getUint16(p + 28, true);
    const largoExtra = vista.getUint16(p + 30, true);
    const largoComentario = vista.getUint16(p + 32, true);
    const desplazamiento = vista.getUint32(p + 42, true);
    const nombre = decodificador.decode(datos.subarray(p + 46, p + 46 + largoNombre));
    entradas.set(nombre, { metodo, tamano, desplazamiento });
    p += 46 + largoNombre + largoExtra + largoComentario;
  }

  async function bytes(nombre: string): Promise<Uint8Array | null> {
    const e = entradas.get(nombre);
    if (!e) return null;
    const inicio = e.desplazamiento + 30 + vista.getUint16(e.desplazamiento + 26, true) + vista.getUint16(e.desplazamiento + 28, true);
    const comprimido = datos.subarray(inicio, inicio + e.tamano);
    if (e.metodo === 0) return comprimido.slice();
    if (e.metodo !== 8) throw new Error("Compresión de ZIP no compatible.");
    const flujo = new Blob([comprimido.slice()]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(flujo).arrayBuffer());
  }

  return {
    nombres: [...entradas.keys()],
    tiene: (nombre) => entradas.has(nombre),
    bytes,
    texto: async (nombre) => { const b = await bytes(nombre); return b ? decodificador.decode(b) : ""; },
  };
}
