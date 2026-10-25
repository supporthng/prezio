import Link from "next/link";
import { supabaseServidor } from "@/lib/supabase/server";

const SECCIONES = [
  { clave: "resumen", texto: "Resumen", ruta: "" },
  { clave: "sucursales", texto: "Sucursales", ruta: "/sucursales" },
  { clave: "inventarios", texto: "Inventarios", ruta: "/inventarios" },
  { clave: "apariencia", texto: "Apariencia", ruta: "/apariencia" },
  { clave: "equipos", texto: "Equipos", ruta: "/equipos" },
  { clave: "usuarios", texto: "Usuarios", ruta: "/usuarios" },
] as const;

/** Pestañas del panel de un negocio (y el aviso si la plataforma lo suspendió). */
export async function SubNav({ slug, activa }: { slug: string; activa: string }) {
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("negocios").select("plan").eq("slug", slug).maybeSingle();
  const suspendido = (data as { plan?: string } | null)?.plan === "suspendido";
  return (
    <>
    {suspendido && (
      <p className="aviso error" role="alert">
        Este negocio está suspendido: puedes ver tus datos, pero no cambiarlos, y los verificadores no muestran precios.
        Comunícate con tu proveedor de Prezio.
      </p>
    )}
    <nav className="subnav" aria-label="Secciones del negocio">
      {SECCIONES.map((s) => (
        <Link key={s.clave} href={`/n/${slug}${s.ruta}`} aria-current={activa === s.clave ? "page" : undefined}>
          {s.texto}
        </Link>
      ))}
      <Link href={`/v/${slug}`} className="subnav-verificador">Abrir verificador ›</Link>
    </nav>
    </>
  );
}
