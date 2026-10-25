import Link from "next/link";
import { redirect } from "next/navigation";
import { Barra } from "@/components/Barra";
import { cargarNegocio } from "@/lib/negocio";

export const metadata = { title: "Verificador" };

type Props = { params: Promise<{ slug: string }> };

/** Elegir la sucursal del verificador (el encargado va directo a la suya). */
export default async function ElegirSucursal({ params }: Props) {
  const { slug } = await params;
  const { supabase, negocio, rol, miSucursal } = await cargarNegocio(slug, `/v/${slug}`);
  const { data } = await supabase.from("sucursales").select("id, codigo, nombre, es_principal")
    .eq("negocio_id", negocio.id).eq("activa", true).order("es_principal", { ascending: false }).order("nombre");
  const sucursales = (data ?? []) as { id: string; codigo: string; nombre: string; es_principal: boolean }[];
  const propia = rol === "encargado" ? sucursales.find((s) => s.id === miSucursal) : undefined;
  if (propia) redirect(`/v/${slug}/${propia.codigo}`);
  if (sucursales.length === 1) redirect(`/v/${slug}/${sucursales[0].codigo}`);
  return (
    <>
      <Barra negocio={{ nombre: negocio.nombre, slug: negocio.slug }} />
      <main className="contenido" style={{ maxWidth: 640 }}>
        <h1>¿En qué sucursal está este verificador?</h1>
        <p className="quieto">La pantalla mostrará los precios de esa sucursal. Guarda la dirección en el equipo para abrirla directo.</p>
        <ul className="lista tarjeta">
          {sucursales.map((s) => (
            <li key={s.id}>
              <span>{s.nombre}</span>
              <Link className="boton" href={`/v/${slug}/${s.codigo}`}>Abrir</Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
