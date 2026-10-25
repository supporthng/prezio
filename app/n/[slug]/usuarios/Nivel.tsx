"use client";

import { useEffect, useRef, useState } from "react";
import type { Nivel } from "./tipos";

type Props = { id: string; niveles: Nivel[]; actual: string | null; puedoDar: string[]; children: React.ReactNode };

/** Elegir el nivel de acceso: marca solas las casillas del nivel (y pide sucursales si es «por sucursal»).
 *  «Personalizado» deja marcar las casillas a mano. Sin JavaScript el servidor igual usa el nivel elegido. */
export function SelectorNivel({ id, niveles, actual, puedoDar, children }: Props) {
  const caja = useRef<HTMLDivElement>(null);
  const [nivel, setNivel] = useState(actual ?? "");
  const elegido = niveles.find((n) => n.id === nivel) ?? null;

  useEffect(() => {
    const c = caja.current;
    if (!c || !elegido) {
      c?.querySelectorAll<HTMLInputElement>('input[name="permiso"][type="checkbox"]').forEach((x) => { x.disabled = !puedoDar.includes(x.value); });
      return;
    }
    c.querySelectorAll<HTMLInputElement>('input[name="permiso"][type="checkbox"]').forEach((x) => {
      x.checked = elegido.permisos.includes(x.value);
      x.disabled = true;   // salen del nivel
    });
    const algunas = c.querySelector<HTMLInputElement>('input[name="alcance"][value="algunas"]');
    const todas = c.querySelector<HTMLInputElement>('input[name="alcance"][value="todas"]');
    if (elegido.por_sucursal && algunas) algunas.checked = true;
    else if (!elegido.por_sucursal && todas) todas.checked = true;
  }, [elegido, puedoDar]);

  return (
    <div ref={caja}>
      <div className="campo nivel-campo">
        <label htmlFor={`nivel-${id}`}>Nivel de acceso</label>
        <select id={`nivel-${id}`} name="nivel" value={nivel} onChange={(e) => setNivel(e.target.value)}>
          {niveles.map((n) => (
            <option key={n.id} value={n.id} disabled={!n.permisos.every((p) => puedoDar.includes(p))}>{n.nombre}</option>
          ))}
          <option value="">Personalizado (marcar casillas)</option>
        </select>
        <span className="quieto pequeno">
          {elegido ? (elegido.descripcion || "Las casillas salen del nivel.") + (elegido.por_sucursal ? " Elige en qué sucursales." : "")
            : "Marca a mano lo que puede hacer."}
        </span>
      </div>
      {children}
    </div>
  );
}
