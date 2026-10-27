"use client";

import { useState } from "react";
import { BotonEnviar, Formulario } from "@/components/Formulario";
import { anularCobro } from "../acciones";

export function AnularCobro({ id, numero }: { id: string; numero: string }) {
  const [abierto, setAbierto] = useState(false);
  if (!abierto)
    return (
      <button type="button" className="boton-peligro" onClick={() => setAbierto(true)}>
        Anular recibo
      </button>
    );
  return (
    <Formulario accion={anularCobro} className="tarjeta w-full max-w-md space-y-2 p-4" confirmar={`¿Anular el recibo ${numero}?`}>
      <input type="hidden" name="id" value={id} />
      <label className="etiqueta" htmlFor="motivo-cobro">Motivo</label>
      <input id="motivo-cobro" name="motivo" className="campo" placeholder="Ej.: cheque devuelto, error de digitación" required />
      <div className="flex gap-2">
        <BotonEnviar className="boton-peligro boton-chico" pendiente="Anulando…">Anular</BotonEnviar>
        <button type="button" className="boton-sec boton-chico" onClick={() => setAbierto(false)}>Cancelar</button>
      </div>
    </Formulario>
  );
}
