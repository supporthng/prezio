/** Estado de la licencia de un negocio, tal como lo calcula la base (public.licencia_estado / negocio_licencia). */
export type EstadoLic = {
  estado: "prueba" | "activa" | "por_vencer" | "gracia" | "vencida" | "suspendida";
  bloqueado: boolean;
  plan: string;
  plan_antes?: string | null;
  plan_nombre: string;
  permanente: boolean;
  vence: string | null;
  dias: number | null;               // días que faltan (negativo si ya venció)
  gracia_hasta: string | null;
  dias_gracia_quedan: number | null;
  dias_aviso: number;
  dias_gracia: number;
  licencia?: string;
};

export type Limites = { sucursales: number | null; equipos: number | null; usuarios: number | null; pcs: number | null };
export type Plan = {
  codigo: string; nombre: string; descripcion: string | null; precio: number | string; periodo: "mensual" | "anual";
  permanente: boolean; destacado: boolean; etiqueta: string | null; funciones: string[];
  max_sucursales: number | null; max_equipos: number | null; max_usuarios: number | null; max_pcs: number | null;
  activo?: boolean; orden?: number; negocios?: number;
};

export const fechaCorta = (d: Date | string) => new Date(d).toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric" });
const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

/** Para la etiqueta: «Prueba · 12 días», «Básico · hasta 25 nov 2026», «Vencida · 5 días de gracia»… */
export function textoLicencia(e: EstadoLic): string {
  switch (e.estado) {
    case "suspendida": return "Suspendida";
    case "vencida": return e.plan === "prueba" ? "Prueba vencida" : e.vence ? `Vencida el ${fechaCorta(e.vence)}` : "Vencida";
    case "gracia": return `Vencida · ${dias(e.dias_gracia_quedan ?? 0)} de gracia`;
    case "prueba": return `Prueba · ${dias(Math.max(0, e.dias ?? 0))}`;
    case "por_vencer": return `${e.plan_nombre} · vence en ${dias(Math.max(0, e.dias ?? 0))}`;
    default: return e.permanente ? `${e.plan_nombre} · permanente` : e.vence ? `${e.plan_nombre} · hasta ${fechaCorta(e.vence)}` : e.plan_nombre;
  }
}

/** El aviso que se muestra arriba del panel (o nada si todo va bien). */
export function avisoLicencia(e: EstadoLic): { tono: "error" | "nota"; texto: string } | null {
  if (e.estado === "suspendida") {
    return { tono: "error", texto: "Este negocio está suspendido: puedes ver tus datos, pero no cambiarlos, y los verificadores no muestran precios." };
  }
  if (e.estado === "vencida") {
    return { tono: "error", texto: `${e.plan === "prueba" ? "Terminó tu prueba." : `Tu licencia venció el ${fechaCorta(e.vence!)}.`} Puedes ver tus datos, pero no cambiarlos, y los verificadores no muestran precios hasta renovarla.` };
  }
  if (e.estado === "gracia") {
    return { tono: "error", texto: `Tu licencia venció el ${fechaCorta(e.vence!)}. Todo sigue funcionando ${dias(e.dias_gracia_quedan ?? 0)} más; después quedará en solo lectura.` };
  }
  if (e.estado === "por_vencer" || (e.estado === "prueba" && e.dias !== null && e.dias <= e.dias_aviso)) {
    return { tono: "nota", texto: `${e.estado === "prueba" ? "Tu prueba termina" : "Tu licencia vence"} en ${dias(Math.max(0, e.dias ?? 0))} (${fechaCorta(e.vence!)}).` };
  }
  return null;
}

/** «US$ 9.50 al mes», «US$ 300 pago único»… */
export function precioPlan(p: Pick<Plan, "precio" | "periodo" | "permanente">, moneda = "US$"): string {
  const n = Number(p.precio) || 0;
  if (n === 0) return "Consultar precio";
  const t = `${moneda} ${n.toLocaleString("es-DO", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  return p.permanente ? `${t} pago único` : `${t} ${p.periodo === "anual" ? "al año" : "al mes"}`;
}

/** Lo que incluye un plan, en una línea: «1 sucursal · 3 verificadores · 5 usuarios · 1 PC». */
export function limitesPlan(p: { max_sucursales: number | null; max_equipos: number | null; max_usuarios: number | null; max_pcs: number | null }): string {
  const u = (n: number | null, uno: string, varios: string) => (n === null ? `${varios} sin límite` : `${n} ${n === 1 ? uno : varios}`);
  return [u(p.max_sucursales, "sucursal", "sucursales"), u(p.max_equipos, "verificador", "verificadores"),
    u(p.max_usuarios, "usuario", "usuarios"), u(p.max_pcs, "PC", "PCs")].join(" · ");
}
