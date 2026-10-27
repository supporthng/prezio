import type { Metadata, Viewport } from "next";
import "@fontsource-variable/manrope";
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Fumio", template: "%s · Fumio" },
  description: "Gestión de rutas, clientes y servicios de fumigación",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Fumio", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0e2a1e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-DO" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
