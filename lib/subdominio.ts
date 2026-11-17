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
