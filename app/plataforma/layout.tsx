import type { Metadata, Viewport } from "next";

// La Plataforma se puede instalar en el celular (Android: «Instalar app»;
// iPhone: Compartir → «Agregar a inicio»). Sigue pidiendo clave y código.
export const metadata: Metadata = {
  manifest: "/plataforma.webmanifest",
  applicationName: "Prezcio Plataforma",
  appleWebApp: { capable: true, title: "Plataforma", statusBarStyle: "black-translucent" },
  icons: { apple: "/iconos/prezio-192.png" },
};

export const viewport: Viewport = { themeColor: "#102a43" };

export default function LayoutPlataforma({ children }: { children: React.ReactNode }) {
  return children;
}
