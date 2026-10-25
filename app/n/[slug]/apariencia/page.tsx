import { Barra } from "@/components/Barra";
import { SubNav } from "@/components/SubNav";
import { cargarNegocio } from "@/lib/negocio";
import { normalizar } from "@/lib/apariencia";
import { Editor } from "./Editor";

export const metadata = { title: "Apariencia" };

type Props = { params: Promise<{ slug: string }> };

export default async function AparienciaPagina({ params }: Props) {
  const { slug } = await params;
  const { supabase, negocio, puede } = await cargarNegocio(slug, `/n/${slug}/apariencia`);
  const administra = puede("apariencia");
  const { data } = await supabase.from("sucursales").select("nombre").eq("negocio_id", negocio.id)
    .order("es_principal", { ascending: false }).limit(1);
  const sucursal = ((data ?? []) as { nombre: string }[])[0]?.nombre ?? "Principal";
  return (
    <>
      <Barra negocio={{ nombre: negocio.nombre, slug: negocio.slug }} />
      <main className="contenido ancho">
        <h1>{negocio.nombre}</h1>
        <SubNav slug={slug} activa="apariencia" />
        {!administra && <p className="aviso bien">Cambiar la apariencia requiere la casilla «Apariencia» (Usuarios).</p>}
        <Editor negocioId={negocio.id} slug={slug} negocio={negocio.nombre} sucursal={sucursal}
          inicial={normalizar(negocio.apariencia)} moneda={negocio.moneda} puedeEditar={administra} />
      </main>
    </>
  );
}
