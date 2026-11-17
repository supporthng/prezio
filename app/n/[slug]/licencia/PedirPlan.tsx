"use client";

import { useState } from "react";
import { useEnApp } from "@/components/EnApp";
import { limitesPlan, precioAnual, totalPago, type Plan } from "@/lib/licencia";
import { solicitarPlan } from "./actions";

/** Elegir un plan y pedirlo al proveedor (también desde la app Prezcio Administrador). */
export function PedirPlan({ planes, actual, negocio, slug, moneda, descuento, plazo }: {
  planes: Plan[]; actual: string; negocio: string; slug: string; moneda: string; descuento: number; plazo: number;
}) {
  const enApp = useEnApp();
  const [elegido, setElegido] = useState<Plan | null>(null);
  const [modo, setModo] = useState<"mensual" | "anual">("mensual");
  const meses = modo === "anual" ? 12 : 1;
  const elegir = (p: Plan) => setElegido(p);
  const t = elegido ? totalPago(elegido, meses, descuento) : null;
  const dinero = (n: number) => `${moneda} ${n.toLocaleString("es-DO", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  /** Precio grande de la tarjeta según lo que eligió (mensual o anual) y la línea chica de abajo. */
  const precios = (p: Plan): [string, string] => {
    const n = Number(p.precio) || 0;
    if (!n) return ["Consultar precio", ""];
    if (p.permanente) return [`${dinero(n)}`, "Pago único"];
    const mes = p.periodo === "anual" ? n / 12 : n, anio = precioAnual(p, descuento) ?? n * 12;
    return modo === "anual"
      ? [`${dinero(anio)} al año`, `Equivale a ${dinero(Math.round((anio / 12) * 100) / 100)} al mes`]
      : [`${dinero(mes)} al mes`, descuento > 0 ? `Anual: ${dinero(anio)} (ahorras ${descuento}%)` : `Anual: ${dinero(anio)}`];
  };

  return (
    <div>
      <div className="lic-modo" role="radiogroup" aria-label="Forma de pago">
        <button type="button" role="radio" aria-checked={modo === "mensual"} className={modo === "mensual" ? "on" : ""} onClick={() => setModo("mensual")}>Mensual</button>
        <button type="button" role="radio" aria-checked={modo === "anual"} className={modo === "anual" ? "on" : ""} onClick={() => setModo("anual")}>
          Anual{descuento > 0 && <span className="lic-ahorro">−{descuento}%</span>}</button>
      </div>
      <ul className="lic-planes">
        {planes.map((p) => (
          <li key={p.codigo} className={`lic-plan${p.destacado ? " destacado" : ""}${elegido?.codigo === p.codigo ? " elegido" : ""}`}>
            {(p.etiqueta || p.codigo === actual) && <span className="lic-plan-etq">{p.codigo === actual ? "Tu plan" : p.etiqueta}</span>}
            <h3>{p.nombre}</h3>
            <p className="lic-precio">{precios(p)[0]}</p>
            {precios(p)[1] && <p className="lic-anual">{precios(p)[1]}</p>}
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
          <h3>Pedir {elegido.nombre} · {modo === "anual" ? "anual" : "mensual"}</h3>
          {!elegido.permanente && <p className="quieto pequeno">Pago {modo === "anual" ? `anual (12 meses${descuento > 0 ? `, con ${descuento}% de descuento` : ""})` : "mensual"}. Puedes cambiarlo arriba.</p>}
          {t !== null && <p className="lic-total">Total: <strong>{dinero(t)}</strong>{!elegido.permanente && (modo === "anual" ? " por un año" : " por un mes")}</p>}
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
