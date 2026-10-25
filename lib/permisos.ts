/** Las casillas de permisos (mismo orden y nombres que en la base: miembros.permisos). */
export const PERMISOS = ["reportes", "inventarios", "sucursales", "equipos", "apariencia", "usuarios"] as const;
export type Permiso = (typeof PERMISOS)[number];
export const NOMBRE_PERMISO: Record<Permiso, { nombre: string; detalle: string }> = {
  reportes: { nombre: "Reportes", detalle: "Ver las consultas y lo buscado sin precio" },
  inventarios: { nombre: "Inventarios", detalle: "Cargar precios, Google y la base de datos del sistema" },
  sucursales: { nombre: "Sucursales", detalle: "Crear, renombrar y elegir de dónde toman los precios" },
  equipos: { nombre: "Equipos", detalle: "Vincular, mover y quitar verificadores; clave de salida" },
  apariencia: { nombre: "Apariencia", detalle: "Estilo, colores, logo y QR de la pantalla" },
  usuarios: { nombre: "Usuarios", detalle: "Crear usuarios y darles permisos" },
};

/** Texto corto de las casillas de una persona: «Todo», «Inventarios y reportes», «Sin permisos». */
export function resumenPermisos(rol: string, permisos: string[] | null, sucursales: string[] | null, nombreSucursal: (id: string) => string): string {
  if (rol === "dueno") return "Dueño · todo";
  const p = (permisos ?? []).filter((x): x is Permiso => (PERMISOS as readonly string[]).includes(x));
  if (!p.length) return "Solo usa el verificador";
  const texto = p.length === PERMISOS.length ? "Todo" : p.map((x) => NOMBRE_PERMISO[x].nombre).join(", ");
  return sucursales === null ? texto : `${texto} · en ${sucursales.map(nombreSucursal).join(", ") || "ninguna sucursal"}`;
}
