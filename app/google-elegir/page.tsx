import type { Metadata } from "next";
import { Elegir } from "./Elegir";

export const metadata: Metadata = { title: "Elegir de Google Drive · Prezcio", robots: { index: false } };

export default function PaginaElegir() {
  return <Elegir />;
}
