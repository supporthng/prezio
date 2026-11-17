/**
 * Enlace corto de cada negocio: onetech.prezcio.app → prezcio.app/n/onetech (el panel; pide entrar si hace falta).
 * Requiere, una sola vez, un registro comodín en el DNS (Cloudflare): «*» CNAME cname.vercel-dns.com, sin proxy.
 */
export const RESERVADOS = new Set([
  "www", "app", "api", "admin", "mail", "correo", "smtp", "ftp", "panel", "plataforma", "soporte", "ayuda", "status",
  "descargas", "portal", "inicio", "prezcio", "prezio", "blog", "docs", "cdn", "static", "assets", "entrar", "login",
]);

/** «onetech.prezcio.app» → «onetech» si es un subdominio de un negocio de `base` (ej. prezcio.app). */
export function subdominioDe(host: string, base: string): string | null {
  const h = host.toLowerCase().split(":")[0];
  const b = base.toLowerCase();
  if (!b || !h.endsWith("." + b)) return null;
  const sub = h.slice(0, -(b.length + 1));
  if (!/^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/.test(sub) || RESERVADOS.has(sub)) return null;
  return sub;
}

/** Dominio base del sitio («prezcio.app») a partir de su dirección. */
export function dominioBase(sitio: string): string {
  try { return new URL(sitio).hostname.replace(/^www\./, ""); } catch { return ""; }
}

/** Enlace corto de un negocio, o el largo si no hay dominio propio. */
export function enlaceNegocio(sitio: string, slug: string): string {
  const base = dominioBase(sitio || "https://prezcio.app");
  return base && !base.endsWith(".vercel.app") && !RESERVADOS.has(slug) ? `https://${slug}.${base}` : `${sitio}/n/${slug}`;
}

/** Rutas del sitio que en un subdominio se sirven tal cual (entrar, salir, el panel /n/…, el verificador /v/…). */
const PROPIAS = ["api", "auth", "c", "cuenta", "entrar", "equipo", "google-elegir", "invitacion", "n", "negocios", "plataforma",
  "privacidad", "registro", "salir", "terminos", "v", "_next"];

/** En onetech.prezcio.app: «/» → /n/onetech, «/ofertas» → /n/onetech/ofertas, «/verificador» → /v/onetech. null = tal cual. */
export function rutaDeSubdominio(sub: string, ruta: string): string | null {
  if (ruta === "/verificador" || ruta.startsWith("/verificador/")) return `/v/${sub}${ruta.slice("/verificador".length)}`;
  const [, primera = "", segunda = ""] = ruta.split("/");
  // La dirección de un negocio solo muestra ese negocio: /n/otro o /v/otro vuelven a su panel.
  if ((primera === "n" || primera === "v") && segunda !== sub) return `/n/${sub}`;
  if (primera && PROPIAS.includes(primera)) return null;
  return `/n/${sub}${ruta === "/" ? "" : ruta}`;
}

/** Dominio de las cookies de sesión: «.prezcio.app» en prezcio.app y sus subdominios (una sola sesión para todos). */
export function dominioCookies(host: string, base: string): string | undefined {
  const h = host.toLowerCase().split(":")[0];
  return base && (h === base || h.endsWith("." + base)) ? "." + base : undefined;
}
