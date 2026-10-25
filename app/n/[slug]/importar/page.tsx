import { Barra } from "@/components/Barra";
import { SubNav } from "@/components/SubNav";
import { cargarNegocio } from "@/lib/negocio";
import { Importar } from "./Importar";

export const metadata = { title: "Importar del sistema anterior" };

type Props = { params: Promise<{ slug: string }> };

export default async function PaginaImportar({ params }: Props) {
  const { slug } = await params;
  const { negocio, puede } = await cargarNegocio(slug, `/n/${slug}/importar`);
  const administra = puede("inventarios") && puede("sucursales") && puede("apariencia");
  return (
    <>
      <Barra negocio={{ nombre: negocio.nombre, slug: negocio.slug }} />
      <main className="contenido">
        <h1>{negocio.nombre}</h1>
        <SubNav slug={slug} activa="inventarios" />
        <h2 style={{ marginTop: 0 }}>Importar del sistema anterior</h2>
        {administra ? <Importar negocioId={negocio.id} slug={slug} />
          : <p className="aviso error">Importar requiere las casillas «Inventarios», «Sucursales» y «Apariencia» en todas las sucursales.</p>}
      </main>
    </>
  );
}
