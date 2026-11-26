import type { Metadata, Viewport } from "next";

type Props = { params: Promise<{ slug: string }>; children: React.ReactNode };

// El panel del negocio se puede instalar en el celular (Android: «Instalar app»; iPhone: «Agregar a inicio»).
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return {
    manifest: `/negocio.webmanifest?n=${encodeURIComponent(slug)}`,
    appleWebApp: { capable: true, title: slug.toUpperCase().slice(0, 14), statusBarStyle: "black-translucent" },
    icons: { apple: "/iconos/prezio-192.png" },
  };
}

export const viewport: Viewport = { themeColor: "#102a43" };

export default async function LayoutNegocio({ children }: Props) {
  return children;
}
