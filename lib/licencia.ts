/** Estado de la licencia de un negocio (igual que public.negocio_suspendido / negocio_licencia en la base). */
export type DatosLicencia = { plan: string; prueba_hasta: string | null; pagado_hasta?: string | null; licencia?: string | null };
export type EstadoLicencia = {
  estado: "prueba" | "activa" | "vencida" | "suspendida";
  bloqueado: boolean;
  vence: Date | null;
  dias: number | null;   // días que faltan (negativo si ya venció)
  texto: string;          // para la etiqueta: «Prueba · 12 días», «Pagada hasta 25 nov 2026», «Vencida»…
};

export const PLANES: Record<string, string> = { prueba: "Prueba", basico: "Básico", profesional: "Profesional", suspendido: "Suspendido" };
export const fechaCorta = (d: Date) => d.toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric" });

export function estadoLicencia(n: DatosLicencia, ahora = Date.now()): EstadoLicencia {
  const fecha = n.plan === "prueba" ? n.prueba_hasta : n.plan === "basico" || n.plan === "profesional" ? n.pagado_hasta ?? null : null;
  const vence = fecha ? new Date(fecha) : null;
  const dias = vence ? Math.ceil((vence.getTime() - ahora) / 864e5) : null;
  if (n.plan === "suspendido") return { estado: "suspendida", bloqueado: true, vence, dias, texto: "Suspendida" };
  if (vence && vence.getTime() < ahora) return { estado: "vencida", bloqueado: true, vence, dias, texto: n.plan === "prueba" ? "Prueba vencida" : `Vencida el ${fechaCorta(vence)}` };
  if (n.plan === "prueba") return { estado: "prueba", bloqueado: false, vence, dias, texto: `Prueba · ${dias} ${dias === 1 ? "día" : "días"}` };
  return { estado: "activa", bloqueado: false, vence, dias, texto: vence ? `${PLANES[n.plan] ?? n.plan} · hasta ${fechaCorta(vence)}` : PLANES[n.plan] ?? n.plan };
}
