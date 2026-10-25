import Link from "next/link";

const SECCIONES = [
  { clave: "resumen", texto: "Resumen", ruta: "" },
  { clave: "inventarios", texto: "Inventarios", ruta: "/inventarios" },
  { clave: "apariencia", texto: "Apariencia", ruta: "/apariencia" },
  { clave: "equipos", texto: "Equipos", ruta: "/equipos" },
  { clave: "usuarios", texto: "Usuarios", ruta: "/usuarios" },
] as const;

/** Pestañas del panel de un negocio. */
export function SubNav({ slug, activa }: { slug: string; activa: string }) {
  return (
    <nav className="subnav" aria-label="Secciones del negocio">
      {SECCIONES.map((s) => (
        <Link key={s.clave} href={`/n/${slug}${s.ruta}`} aria-current={activa === s.clave ? "page" : undefined}>
          {s.texto}
        </Link>
      ))}
      <Link href={`/v/${slug}`} className="subnav-verificador">Abrir verificador ›</Link>
    </nav>
  );
}
