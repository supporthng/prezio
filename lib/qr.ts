/** Generador de códigos QR sin librerías (modo byte, corrección de errores nivel M: aguanta ~15 % de daño).
 *  Sigue el estándar ISO/IEC 18004 (mismo método que la referencia de Project Nayuki). Devuelve la matriz de
 *  módulos: true = negro. Se usa para el enlace de la consulta desde el celular. */

const ECC_POR_BLOQUE_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
const BLOQUES_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
const FORMATO_M = 0; // bits del nivel M en la información de formato

function modulosDeDatos(v: number): number {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) {
    const n = Math.floor(v / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (v >= 7) r -= 36;
  }
  return r;
}
const palabrasDeDatos = (v: number) => Math.floor(modulosDeDatos(v) / 8) - ECC_POR_BLOQUE_M[v] * BLOQUES_M[v];

// ---------------------------------------------------------------- Reed-Solomon en GF(256), polinomio 0x11D
function multiplicar(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}
function divisor(grado: number): number[] {
  const r = new Array<number>(grado).fill(0);
  r[grado - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grado; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = multiplicar(r[j], raiz);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    raiz = multiplicar(raiz, 0x02);
  }
  return r;
}
function resto(datos: number[], div: number[]): number[] {
  const r = div.map(() => 0);
  for (const b of datos) {
    const f = b ^ (r.shift() as number);
    r.push(0);
    div.forEach((c, i) => { r[i] ^= multiplicar(c, f); });
  }
  return r;
}

// ---------------------------------------------------------------- matriz
export function generarQR(texto: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(texto));
  let version = 1;
  for (; version <= 40; version++) {
    const bitsCuenta = version <= 9 ? 8 : 16;
    if (4 + bitsCuenta + bytes.length * 8 <= palabrasDeDatos(version) * 8) break;
  }
  if (version > 40) throw new Error("Texto demasiado largo para un QR");

  // Bits: modo byte (0100), cantidad, datos, terminador, relleno.
  const bits: number[] = [];
  const poner = (valor: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((valor >>> i) & 1); };
  poner(4, 4);
  poner(bytes.length, version <= 9 ? 8 : 16);
  bytes.forEach((b) => poner(b, 8));
  const capacidad = palabrasDeDatos(version) * 8;
  poner(0, Math.min(4, capacidad - bits.length));
  poner(0, (8 - (bits.length % 8)) % 8);
  for (let relleno = 0xec; bits.length < capacidad; relleno ^= 0xec ^ 0x11) poner(relleno, 8);
  const datos: number[] = [];
  for (let i = 0; i < bits.length; i += 8) datos.push(parseInt(bits.slice(i, i + 8).join(""), 2));

  // Bloques con su corrección de errores, intercalados.
  const nBloques = BLOQUES_M[version], ecc = ECC_POR_BLOQUE_M[version];
  const total = Math.floor(modulosDeDatos(version) / 8);
  const cortos = nBloques - (total % nBloques);
  const largoCorto = Math.floor(total / nBloques);
  const div = divisor(ecc);
  const bloques: number[][] = [];
  for (let i = 0, k = 0; i < nBloques; i++) {
    const d = datos.slice(k, k + largoCorto - ecc + (i < cortos ? 0 : 1));
    k += d.length;
    const b = [...d, ...resto(d, div)];
    if (i < cortos) b.splice(d.length, 0, 0);      // hueco para igualar largos (no se escribe)
    bloques.push(b);
  }
  const palabras: number[] = [];
  for (let i = 0; i < bloques[0].length; i++) {
    bloques.forEach((b, j) => { if (i !== largoCorto - ecc || j >= cortos) palabras.push(b[i]); });
  }

  const tam = version * 4 + 17;
  const m: boolean[][] = Array.from({ length: tam }, () => new Array<boolean>(tam).fill(false));
  const fijo: boolean[][] = Array.from({ length: tam }, () => new Array<boolean>(tam).fill(false));
  const pintar = (x: number, y: number, negro: boolean) => { m[y][x] = negro; fijo[y][x] = true; };

  // Líneas de tiempo
  for (let i = 0; i < tam; i++) { pintar(6, i, i % 2 === 0); pintar(i, 6, i % 2 === 0); }
  // Patrones de posición (las tres esquinas)
  const buscador = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
      if (x >= 0 && x < tam && y >= 0 && y < tam) pintar(x, y, d !== 2 && d !== 4);
    }
  };
  buscador(3, 3); buscador(tam - 4, 3); buscador(3, tam - 4);
  // Patrones de alineación
  const posiciones: number[] = [];
  if (version > 1) {
    const n = Math.floor(version / 7) + 2;
    const paso = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (n * 2 - 2)) * 2;
    posiciones.push(6);
    for (let p = tam - 7; posiciones.length < n; p -= paso) posiciones.splice(1, 0, p);
  }
  posiciones.forEach((ax, i) => posiciones.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === posiciones.length - 1) || (i === posiciones.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) pintar(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  // Reservar formato (se escribe al final) y versión
  const formato = (mascara: number) => {
    const d = (FORMATO_M << 3) | mascara;
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412;
    const bit = (i: number) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) pintar(8, i, bit(i));
    pintar(8, 7, bit(6)); pintar(8, 8, bit(7)); pintar(7, 8, bit(8));
    for (let i = 9; i < 15; i++) pintar(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) pintar(tam - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) pintar(8, tam - 15 + i, bit(i));
    pintar(8, tam - 8, true);
  };
  formato(0);
  if (version >= 7) {
    let r = version;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (version << 12) | r;
    for (let i = 0; i < 18; i++) {
      const negro = ((b >>> i) & 1) === 1, a = tam - 11 + (i % 3), c = Math.floor(i / 3);
      pintar(a, c, negro); pintar(c, a, negro);
    }
  }
  // Datos en zigzag
  let i = 0;
  for (let derecha = tam - 1; derecha >= 1; derecha -= 2) {
    if (derecha === 6) derecha = 5;
    for (let vert = 0; vert < tam; vert++) for (let j = 0; j < 2; j++) {
      const x = derecha - j, subiendo = ((derecha + 1) & 2) === 0, y = subiendo ? tam - 1 - vert : vert;
      if (!fijo[y][x] && i < palabras.length * 8) { m[y][x] = ((palabras[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }
  // Máscara: se prueba cada una y queda la de menor penalización
  const aplicar = (k: number) => {
    for (let y = 0; y < tam; y++) for (let x = 0; x < tam; x++) {
      if (fijo[y][x]) continue;
      const inv = [(x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0, (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
        ((x * y) % 2) + ((x * y) % 3) === 0, (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (((x + y) % 2) + ((x * y) % 3)) % 2 === 0][k];
      if (inv) m[y][x] = !m[y][x];
    }
  };
  const penalizacion = () => {
    let p = 0;
    for (const linea of [m, m[0].map((_, x) => m.map((f) => f[x]))]) {
      for (const f of linea) {
        let corrida = 1;
        for (let x = 1; x <= tam; x++) {
          if (x < tam && f[x] === f[x - 1]) corrida++;
          else { if (corrida >= 5) p += corrida - 2; corrida = 1; }
        }
        for (let x = 0; x + 10 < tam; x++) {
          const s = f.slice(x, x + 11).map((v) => (v ? 1 : 0)).join("");
          if (s === "10111010000" || s === "00001011101") p += 40;
        }
      }
    }
    for (let y = 0; y < tam - 1; y++) for (let x = 0; x < tam - 1; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
    }
    const negros = m.reduce((t, f) => t + f.filter(Boolean).length, 0);
    p += Math.floor(Math.abs(negros * 20 - tam * tam * 10) / (tam * tam)) * 10;
    return p;
  };
  let mejor = 0, menor = Infinity;
  for (let k = 0; k < 8; k++) {
    aplicar(k); formato(k);
    const p = penalizacion();
    if (p < menor) { menor = p; mejor = k; }
    aplicar(k);   // deshacer
  }
  aplicar(mejor); formato(mejor);
  return m;
}

/** SVG del QR (con margen blanco de 4 módulos, como pide el estándar). */
export function qrSvg(texto: string, color = "#000000"): string {
  const m = generarQR(texto), n = m.length + 8;
  let d = "";
  m.forEach((f, y) => f.forEach((v, x) => { if (v) d += `M${x + 4} ${y + 4}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="${color}"/></svg>`;
}
