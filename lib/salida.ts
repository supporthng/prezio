/** Clave para salir de las apps Prezio: PBKDF2-SHA256 con sal (WebCrypto). El panel calcula la huella;
 *  el equipo la recibe y comprueba la clave sin internet. La clave misma nunca sale del navegador. */
import type { Salida } from "@/lib/equipo";

const hex = (b: ArrayBuffer | Uint8Array) => Array.from(b instanceof Uint8Array ? b : new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
const bytes = (h: string) => new Uint8Array((h.match(/../g) ?? []).map((x) => parseInt(x, 16)));

async function derivar(clave: string, sal: Uint8Array, iter: number): Promise<string> {
  const llave = await crypto.subtle.importKey("raw", new TextEncoder().encode(clave), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal as BufferSource, iterations: iter }, llave, 256);
  return hex(bits);
}

export const ITERACIONES = 150000;

export async function crearSalida(clave: string): Promise<Salida> {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return { sal: hex(sal), iter: ITERACIONES, hash: await derivar(clave, sal, ITERACIONES) };
}

export async function claveCorrecta(clave: string, s: Salida): Promise<boolean> {
  return (await derivar(clave, bytes(s.sal), s.iter)) === s.hash;
}
