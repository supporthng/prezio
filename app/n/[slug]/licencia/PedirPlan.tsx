"use client";

import { useState } from "react";
import { useEnApp } from "@/components/EnApp";
import { limitesPlan, precioPlan, type Plan } from "@/lib/licencia";
import { solicitarPlan } from "./actions";

/** Elegir un plan y pedirlo al proveedor (también desde la app Prezcio Administrador). */
export function PedirPlan({ planes, actual, negocio, slug, moneda, descuento, plazo }: {
  planes: Plan[]; actual: string; negocio: string; slug: string; moneda: string; descuento: number; plazo: number;
}) {
  const enApp = useEnApp();
  const [elegido, setElegido] = useState<Plan | null>(null);
  const [meses, setMeses] = useState(1);
  const opciones = elegido?.periodo === "anual" ? [12, 24, 36] : [1, 3, 6, 12];

  const elegir = (p: Plan) => { setElegido(p); setMeses(p.periodo === "anual" ? 12 : 1); };
  const total = (p: Plan, m: number) => {
    const n = Number(p.precio) || 0;
    if (!n) return null;
    if (p.permanente) return n;
    if (p.periodo === "anual") return (n * m) / 12;
    return n * m * (m >= 12 ? (100 - descuento) / 100 : 1);
  };
  const t = elegido ? total(elegido, meses) : null;

  return (
    <div>
      <ul className="lic-planes">
        {planes.map((p) => (
          <li key={p.codigo} className={`lic-plan${p.destacado ? " destacado" : ""}${elegido?.codigo === p.codigo ? " elegido" : ""}`}>
            {(p.etiqueta || p.codigo === actual) && <span className="lic-plan-etq">{p.codigo === actual ? "Tu plan" : p.etiqueta}</span>}
            <h3>{p.nombre}</h3>
            <p className="lic-precio">{precioPlan(p, moneda)}</p>
            {p.descripcion && <p className="quieto pequeno">{p.descripcion}</p>}
            <p className="lic-incluye">{limitesPlan(p)}</p>
            {p.funciones.length > 0 && <ul className="lic-funciones">{p.funciones.map((f) => <li key={f}>{f}</li>)}</ul>}
            <button type="button" className={`boton${elegido?.codigo === p.codigo ? "" : " secundario"} ancho`} aria-pressed={elegido?.codigo === p.codigo}
              onClick={() => elegir(p)}>{p.codigo === actual ? "Renovar este plan" : "Elegir"}</button>
          </li>
        ))}
      </ul>

      {elegido && (
        <form action={solicitarPlan} className="tarjeta lic-pedir">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="negocio" value={negocio} />
          <input type="hidden" name="plan" value={elegido.codigo} />
          <input type="hidden" name="meses" value={elegido.permanente ? 0 : meses} />
          <input type="hidden" name="origen" value={enApp ? "app" : "panel"} />
          <h3>Pedir {elegido.nombre}</h3>
          {!elegido.permanente && (
            <div className="campo">
              <span className="etq">Tiempo</span>
              <div className="lic-meses" role="radiogroup" aria-label="Tiempo">
                {opciones.map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={meses === m} className={meses === m ? "on" : ""} onClick={() => setMeses(m)}>
                    {m % 12 === 0 ? `${m / 12} ${m === 12 ? "año" : "años"}` : `${m} ${m === 1 ? "mes" : "meses"}`}
                  </button>
                ))}
              </div>
              {elegido.periodo === "mensual" && descuento > 0 && <p className="quieto pequeno">Pagando un año o más: {descuento}% de descuento.</p>}
            </div>
          )}
          {t !== null && <p className="lic-total">Total aproximado: <strong>{moneda} {t.toLocaleString("es-DO", { maximumFractionDigits: 2 })}</strong></p>}
          <div className="fila">
            <div className="campo"><label htmlFor="lp-contacto">Tu nombre</label><input id="lp-contacto" name="contacto" required minLength={2} maxLength={80} /></div>
            <div className="campo"><label htmlFor="lp-telefono">Teléfono / WhatsApp</label><input id="lp-telefono" name="telefono" required inputMode="tel" maxLength={30} placeholder="809-555-1234" /></div>
          </div>
          <div className="campo"><label htmlFor="lp-correo">Correo <small className="quieto">(opcional)</small></label><input id="lp-correo" name="correo" type="email" maxLength={120} /></div>
          <div className="campo"><label htmlFor="lp-mensaje">Comentario <small className="quieto">(opcional)</small></label>
            <input id="lp-mensaje" name="mensaje" maxLength={500} placeholder="Horario para llamarte, cuántas tiendas tienes, dudas…" /></div>
          <div className="fila">
            <button className="boton" type="submit">Enviar solicitud</button>
            <button className="boton secundario" type="button" onClick={() => setElegido(null)}>Cancelar</button>
          </div>
          <p className="quieto pequeno">Tu proveedor te contacta en menos de {plazo} {plazo === 1 ? "hora" : "horas"} para confirmar el pago. El plan se activa cuando lo aprueba.</p>
        </form>
      )}
    </div>
  );
}
