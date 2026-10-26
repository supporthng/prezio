import type { Metadata } from "next";
import { Elegir } from "./Elegir";

export const metadata: Metadata = { title: "Elegir de Google Drive · Prezio", robots: { index: false } };

export default function PaginaElegir() {
  return <Elegir />;
}
