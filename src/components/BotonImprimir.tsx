"use client";

import { Icono } from "./Icono";

export function BotonImprimir({ texto = "Imprimir", className = "boton-sec" }: { texto?: string; className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      <Icono nombre="imprimir" tam={16} /> {texto}
    </button>
  );
}
