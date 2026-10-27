import Link from "next/link";
import { Icono } from "./Icono";

/** Cambia entre la venta rápida (punto de venta) y la factura completa */
export function SelectorFacturar({ activo }: { activo: "venta" | "factura" }) {
  const base = "inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-bold transition";
  return (
    <nav aria-label="Forma de facturar" className="inline-flex rounded-xl bg-stone-200/70 p-1">
      <Link href="/oficina/venta" aria-current={activo === "venta" ? "page" : undefined} className={`${base} ${activo === "venta" ? "bg-white text-marca-900 shadow-sm" : "text-stone-600 hover:text-stone-900"}`}>
        <Icono nombre="venta" tam={15} /> Venta rápida
      </Link>
      <Link href="/oficina/facturacion/nueva" aria-current={activo === "factura" ? "page" : undefined} className={`${base} ${activo === "factura" ? "bg-white text-marca-900 shadow-sm" : "text-stone-600 hover:text-stone-900"}`}>
        <Icono nombre="facturacion" tam={15} /> Factura completa
      </Link>
    </nav>
  );
}
