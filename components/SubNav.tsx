import Link from "next/link";
import { SoloWeb } from "./EnApp";
import { supabaseServidor } from "@/lib/supabase/server";
import { avisoLicencia, type EstadoLic } from "@/lib/licencia";

const SECCIONES = [
  { clave: "resumen", texto: "Resumen", ruta: "" },
  { clave: "sucursales", texto: "Sucursales", ruta: "/sucursales" },
  { clave: "inventarios", texto: "Inventarios", ruta: "/inventarios" },
  { clave: "ofertas", texto: "Ofertas", ruta: "/ofertas" },
  { clave: "apariencia", texto: "Apariencia", ruta: "/apariencia" },
  { clave: "equipos", texto: "Equipos", ruta: "/equipos" },
  { clave: "usuarios", texto: "Usuarios", ruta: "/usuarios" },
  { clave: "licencia", texto: "Licencia", ruta: "/licencia" },
] as const;

/** Pestañas del panel de un negocio (y el aviso de la licencia: por vencer, en gracia, vencida o suspendida). */
export async function SubNav({ slug, activa }: { slug: string; activa: string }) {
  const supabase = await supabaseServidor();
  const { data: n } = await supabase.from("negocios").select("id").eq("slug", slug).maybeSingle();
  const { data } = n ? await supabase.rpc("negocio_licencia", { p_negocio: n.id }) : { data: null };
  const lic = data as EstadoLic | null;
  const aviso = lic ? avisoLicencia(lic) : null;
  return (
    <>
    {aviso && (
      <p className={`aviso ${aviso.tono}`} role={aviso.tono === "error" ? "alert" : "status"}>
        {aviso.texto}{" "}
        {activa !== "licencia" && <Link href={`/n/${slug}/licencia`}><strong>{lic!.bloqueado || lic!.estado === "gracia" ? "Renovar la licencia" : "Ver la licencia"}</strong></Link>}
      </p>
    )}
    <nav className="subnav" aria-label="Secciones del negocio">
      {SECCIONES.map((s) => (
        <Link key={s.clave} href={`/n/${slug}${s.ruta}`} aria-current={activa === s.clave ? "page" : undefined}>
          {s.texto}
        </Link>
      ))}
      <SoloWeb><Link href={`/v/${slug}`} className="subnav-verificador" target="_blank">Abrir verificador ›</Link></SoloWeb>
    </nav>
    </>
  );
}
