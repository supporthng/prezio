import type { Metadata, Viewport } from "next";
import { sitio } from "@/lib/util";
import { Equipo } from "./Equipo";

export const metadata: Metadata = {
  title: "Prezio · Equipo",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Prezio", statusBarStyle: "black-translucent" },
  robots: { index: false },
};
export const viewport: Viewport = { themeColor: "#102a43", width: "device-width", initialScale: 1, viewportFit: "cover" };

// Página fija (igual para todos los equipos): lo propio de cada uno vive en el equipo, no en la dirección.
export const dynamic = "force-static";

export default function PaginaEquipo() {
  return <Equipo sitio={sitio() || "prezio"} />;
}
