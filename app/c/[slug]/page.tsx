import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { infoMovil } from "../datos";

type Props = { params: Promise<{ slug: string }> };
export const dynamic = "force-dynamic";
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#102a43" };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const info = await infoMovil((await params).slug);
  return { title: info ? `Precios · ${info.negocio.nombre}` : "Precios", robots: { index: false } };
}

/** Elegir la sucursal (si hay una sola, va directo). */
export default async function ElegirSucursalMovil({ params }: Props) {
  const { slug } = await params;
  const info = await infoMovil(slug);
  if (!info) notFound();
  const sucursales = info.sucursales ?? [];
  if (info.activa && sucursales.length === 1) redirect(`/c/${slug}/${sucursales[0].codigo}`);
  return (
    <main className="movil">
      <header className="movil-cabeza"><p className="movil-negocio">{info.negocio.nombre}</p></header>
      {!info.activa ? (
        <p className="movil-aviso">Este negocio no tiene activa la consulta de precios desde el celular.</p>
      ) : (
        <section className="movil-tarjeta">
          <h1>¿En qué tienda estás?</h1>
          <ul className="movil-sucursales">
            {sucursales.map((s) => <li key={s.id}><Link href={`/c/${slug}/${s.codigo}`}>{s.nombre}</Link></li>)}
          </ul>
        </section>
      )}
    </main>
  );
}
