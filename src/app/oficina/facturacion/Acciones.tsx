"use client";

import { useState } from "react";
import { BotonEnviar, Formulario } from "@/components/Formulario";
import type { TipoComprobante } from "@/lib/tipos";
import { anularDocumento, borrarBorrador, notaCredito, proformaAFactura } from "./acciones";

export function BorrarBorrador({ id }: { id: string }) {
  return (
    <Formulario accion={borrarBorrador} confirmar="¿Borrar este borrador? No se puede deshacer.">
      <input type="hidden" name="id" value={id} />
      <BotonEnviar className="boton-peligro boton-chico" pendiente="Borrando…">Borrar borrador</BotonEnviar>
    </Formulario>
  );
}

export function Anular({ id, ncf }: { id: string; ncf: string }) {
  const [abierto, setAbierto] = useState(false);
  if (!abierto)
    return (
      <button type="button" className="boton-peligro boton-chico" onClick={() => setAbierto(true)}>
        Anular
      </button>
    );
  return (
    <Formulario accion={anularDocumento} className="tarjeta w-full space-y-2 p-3" confirmar={`¿Anular ${ncf}? El número queda usado y se reporta en el 608.`}>
      <input type="hidden" name="id" value={id} />
      <label className="etiqueta" htmlFor="motivo">Motivo de la anulación</label>
      <select id="motivo" name="motivo" className="campo w-full" required defaultValue="">
        <option value="" disabled>Elige el motivo…</option>
        <option>01 Deterioro de factura pre-imprenta</option>
        <option>02 Errores de impresión (factura pre-imprenta)</option>
        <option>03 Impresión defectuosa</option>
        <option>04 Corrección de la información</option>
        <option>05 Cambio de productos</option>
        <option>06 Devolución de productos</option>
        <option>07 Omisión de productos</option>
        <option>08 Errores en secuencia de NCF</option>
        <option>09 Por cese de operaciones</option>
        <option>10 Pérdida o hurto de talonarios</option>
      </select>
      <div className="flex gap-2">
        <BotonEnviar className="boton-peligro boton-chico" pendiente="Anulando…">Anular</BotonEnviar>
        <button type="button" className="boton-sec boton-chico" onClick={() => setAbierto(false)}>Cancelar</button>
      </div>
    </Formulario>
  );
}

export function HacerNotaCredito({ id }: { id: string }) {
  return (
    <Formulario accion={notaCredito}>
      <input type="hidden" name="id" value={id} />
      <BotonEnviar className="boton-sec boton-chico" pendiente="Creando…">Nota de crédito</BotonEnviar>
    </Formulario>
  );
}

export function ConvertirProforma({ id, tipos, sugerido }: { id: string; tipos: TipoComprobante[]; sugerido: string }) {
  return (
    <Formulario accion={proformaAFactura} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <select name="tipo_ncf" className="campo text-sm" defaultValue={sugerido} aria-label="Comprobante de la factura">
        {tipos
          .filter((t) => !t.es_nota_credito)
          .map((t) => (
            <option key={t.codigo} value={t.codigo}>{t.codigo} · {t.nombre}</option>
          ))}
      </select>
      <BotonEnviar className="boton boton-chico" pendiente="Convirtiendo…">Convertir en factura</BotonEnviar>
    </Formulario>
  );
}

export function CopiarEnlace({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className="boton-sec boton-chico"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        } catch {
          window.prompt("Copia el enlace:", url);
        }
      }}
    >
      {copiado ? "¡Copiado!" : "Copiar enlace"}
    </button>
  );
}
