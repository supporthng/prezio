import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";
import "./pantalla.css";

const fuente = Figtree({ subsets: ["latin"], variable: "--fuente", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Prezio", template: "%s · Prezio" },
  description: "Verificadores de precios para tu negocio: en línea, sin internet y en todas tus sucursales.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={fuente.variable}>
      <body>{children}</body>
    </html>
  );
}
