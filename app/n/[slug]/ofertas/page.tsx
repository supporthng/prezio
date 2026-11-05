import Link from "next/link";
import { Barra } from "@/components/Barra";
import { Aviso } from "@/components/Aviso";
import { SubNav } from "@/components/SubNav";
import { cargarNegocio } from "@/lib/negocio";
import { normalizar } from "@/lib/apariencia";
import { Lista } from "./Lista";
import type { OfertaFila } from "./FormOferta";

export const metadata = { title: "Ofertas" };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ bien?: string; error?: string }> };

export default async function Ofertas({ params, searchParams }: Props) {
  const { slug } = await params;
  const { bien, error } = await searchParams;
  const { supabase, negocio, puede } = await cargarNegocio(slug, `/n/${slug}/ofertas`);
  const [{ data: ofertas }, { data: sucs }] = await Promise.all([
    supabase.from("ofertas").select("id, nombre, descripcion, tipo, valor, lleva, paga, imagen, sucursales, desde, hasta, dias, hora_desde, hora_hasta, activa, orden, productos:oferta_productos(codigo, precio_oferta)")
      .eq("negocio_id", negocio.id).order("orden").order("creado"),
    supabase.from("sucursales").select("id, nombre").eq("negocio_id", negocio.id).eq("activa", true).order("es_principal", { ascending: false }).order("nombre"),
  ]);
  const a = normalizar(negocio.apariencia);
  const puedeEditar = puede("inventarios");
  // La hora de la página (para ordenar «en pantalla», «programada», «vencida»): se fija al pedirla.
  const ahora = new Date().getTime();

  return (
    <>
      <Barra negocio={{ nombre: negocio.nombre, slug: negocio.slug }} />
      <main className="contenido">
        <Aviso error={error} bien={bien} />
        <h1>Ofertas</h1>
        <SubNav slug={negocio.slug} activa="ofertas" />
        <p className="quieto" style={{ maxWidth: "70ch" }}>
          Las ofertas vigentes se ven en los verificadores mientras esperan, al lado del lector. Al escanear un producto en oferta,
          la pantalla muestra el precio de antes tachado y el de oferta. También funcionan sin internet.
        </p>
        {!a.mostrar_ofertas && (
          <p className="aviso error">Las ofertas están ocultas en la pantalla: actívalas en <Link href={`/n/${slug}/apariencia`}>Apariencia</Link>.</p>
        )}
        {!puedeEditar && <p className="aviso nota">Puedes ver las ofertas; para crearlas o cambiarlas pide el permiso «Inventarios».</p>}
        <Lista ofertas={(ofertas ?? []) as OfertaFila[]} negocio={negocio.id} slug={negocio.slug} sucursales={(sucs ?? []) as { id: string; nombre: string }[]}
          puedeEditar={puedeEditar} ahora={ahora} />
      </main>
    </>
  );
}
