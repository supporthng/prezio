import Link from "next/link";
import type { ReactNode } from "react";
import { Icono } from "./Icono";

/** Título de cada pantalla, con enlace para volver y botones a la derecha */
export function Encabezado({
  titulo,
  detalle,
  volver,
  acciones,
  insignia,
}: {
  titulo: ReactNode;
  detalle?: ReactNode;
  volver?: { href: string; texto: string };
  acciones?: ReactNode;
  insignia?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {volver && (
          <Link href={volver.href} className="mb-1.5 inline-flex items-center gap-1 text-sm font-semibold text-marca-600 hover:text-marca-900">
            <Icono nombre="atras" tam={15} /> {volver.texto}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="titulo">{titulo}</h1>
          {insignia}
        </div>
        {detalle && <p className="mt-1 text-sm text-stone-500">{detalle}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </header>
  );
}

/** Tarjeta de indicador */
export function Indicador({
  titulo,
  valor,
  detalle,
  tono = "normal",
  icono,
  href,
}: {
  titulo: string;
  valor: ReactNode;
  detalle?: ReactNode;
  tono?: "normal" | "alerta" | "peligro" | "oscuro";
  icono?: Parameters<typeof Icono>[0]["nombre"];
  href?: string;
}) {
  const estilos = {
    normal: "border-stone-200 bg-white",
    alerta: "border-amber-200 bg-amber-50/60",
    peligro: "border-orange-200 bg-orange-50/70",
    oscuro: "border-marca-900 bg-marca-900 text-white",
  }[tono];
  const contenido = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[13px] font-semibold ${tono === "oscuro" ? "text-marca-200" : "text-stone-500"}`}>{titulo}</span>
        {icono && (
          <span
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${
              tono === "oscuro" ? "bg-white/10 text-lima" : "bg-stone-100 text-marca-600"
            }`}
          >
            <Icono nombre={icono} tam={16} />
          </span>
        )}
      </div>
      <span className={`kpi ${tono === "oscuro" ? "text-white" : ""}`}>{valor}</span>
      {detalle && <span className={`text-[13px] ${tono === "oscuro" ? "text-marca-200" : "text-stone-600"}`}>{detalle}</span>}
    </>
  );
  const clase = `flex flex-col gap-1.5 rounded-2xl border p-4 shadow-suave sm:p-5 ${estilos}`;
  return href ? (
    <Link href={href} className={`${clase} transition hover:-translate-y-0.5 hover:shadow-flotante`}>
      {contenido}
    </Link>
  ) : (
    <div className={clase}>{contenido}</div>
  );
}
