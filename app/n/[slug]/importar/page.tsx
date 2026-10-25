import { Barra } from "@/components/Barra";
import { SubNav } from "@/components/SubNav";
import { cargarNegocio } from "@/lib/negocio";
import { Importar } from "./Importar";

export const metadata = { title: "Importar del sistema anterior" };

type Props = { params: Promise<{ slug: string }> };

export default async function PaginaImportar({ params }: Props) {
  const { slug } = await params;
  const { negocio, administra } = await cargarNegocio(slug, `/n/${slug}/importar`);
  return (
    <>
      <Barra negocio={{ nombre: negocio.nombre, slug: negocio.slug }} />
      <main className="contenido">
        <h1>{negocio.nombre}</h1>
        <SubNav slug={slug} activa="inventarios" />
        <h2 style={{ marginTop: 0 }}>Importar del sistema anterior</h2>
        {administra ? <Importar negocioId={negocio.id} slug={slug} />
          : <p className="aviso error">Solo el dueño o un administrador importan datos.</p>}
      </main>
    </>
  );
}
