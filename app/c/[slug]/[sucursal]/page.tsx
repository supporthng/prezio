import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { infoMovil } from "../../datos";
import { ConsultaMovil } from "../../ConsultaMovil";

type Props = { params: Promise<{ slug: string; sucursal: string }> };
export const dynamic = "force-dynamic";
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#102a43" };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, sucursal } = await params;
  const info = await infoMovil(slug, sucursal);
  const s = info?.sucursales?.[0];
  return { title: info ? `Precios · ${info.negocio.nombre}${s ? ` · ${s.nombre}` : ""}` : "Precios", robots: { index: false } };
}

/** Consulta de precios desde el celular del cliente (pública, sin cuenta). */
export default async function PaginaConsultaMovil({ params }: Props) {
  const { slug, sucursal } = await params;
  const info = await infoMovil(slug, sucursal);
  if (!info) notFound();
  const s = info.sucursales?.[0];
  if (!info.activa || !s) {
    return (
      <main className="movil">
        <header className="movil-cabeza"><p className="movil-negocio">{info.negocio.nombre}</p></header>
        <p className="movil-aviso">{info.activa ? "Esa sucursal no existe o está cerrada." : "Este negocio no tiene activa la consulta de precios desde el celular."}</p>
      </main>
    );
  }
  return <ConsultaMovil negocio={info.negocio.nombre} moneda={info.negocio.moneda ?? "RD$"} sucursal={s}
    color={info.negocio.apariencia?.color_marca ?? "#0757d4"}
    logo={info.negocio.apariencia?.mostrar_logo === false ? null : (info.negocio.apariencia?.logo ?? null)} />;
}
