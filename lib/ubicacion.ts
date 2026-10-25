/** Ubicación de una sucursal (para la consulta desde el celular de los clientes: solo cerca de la tienda). */

export type Coordenadas = { latitud: number; longitud: number };

const valida = (la: number, lo: number) => Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && !(la === 0 && lo === 0);
const redondear = (n: number) => Math.round(n * 1e6) / 1e6;

/** Coordenadas escritas o pegadas: «18.4861, -69.9312», o un enlace de Google Maps / OpenStreetMap
 *  (…/@18.48,-69.93,17z · …?q=18.48,-69.93 · …!3d18.48!4d-69.93 · …?ll=… · …#map=17/18.48/-69.93). */
export function coordenadasDeTexto(texto: string): Coordenadas | null {
  const t = decodeURIComponent((texto ?? "").trim());
  const patrones = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,              // lugar marcado en Google Maps (el más exacto)
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,               // centro del mapa
    /[?&](?:q|query|ll|center|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&]mlat=(-?\d+(?:\.\d+)?)&mlon=(-?\d+(?:\.\d+)?)/,      // OpenStreetMap con marcador
    /#map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/,         // OpenStreetMap
    /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/,  // escritas a mano
  ];
  for (const p of patrones) {
    const m = t.match(p);
    if (m) {
      const la = Number(m[1]), lo = Number(m[2]);
      if (valida(la, lo)) return { latitud: redondear(la), longitud: redondear(lo) };
    }
  }
  return null;
}

/** ¿Es un enlace corto de Google Maps (maps.app.goo.gl / goo.gl/maps)? Esos no traen las coordenadas. */
export const esEnlaceCorto = (texto: string) => /(?:maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(texto);

/** Distancia en metros entre dos puntos (fórmula del haversine). */
export function distanciaM(a: Coordenadas, b: Coordenadas): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLa = (b.latitud - a.latitud) * rad, dLo = (b.longitud - a.longitud) * rad;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.latitud * rad) * Math.cos(b.latitud * rad) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Mapa de vista previa (OpenStreetMap, sin librerías ni claves). */
export function mapaEmbebido(c: Coordenadas, radioM: number): string {
  const margen = Math.max(radioM * 2.2, 250) / 111320;                 // grados de latitud
  const margenLo = margen / Math.max(0.2, Math.cos((c.latitud * Math.PI) / 180));
  const bbox = [c.longitud - margenLo, c.latitud - margen, c.longitud + margenLo, c.latitud + margen].map((n) => n.toFixed(6)).join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${c.latitud},${c.longitud}`;
}

export const enlaceGoogleMaps = (c: Coordenadas) => `https://www.google.com/maps?q=${c.latitud},${c.longitud}`;
