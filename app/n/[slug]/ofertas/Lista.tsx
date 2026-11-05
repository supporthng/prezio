"use client";

import { useState } from "react";
import { FormOferta, type OfertaFila } from "./FormOferta";
import { borrarOferta, pausarOferta } from "./actions";
import { cuandoOferta, textoOferta, type Oferta } from "@/lib/ofertas";

type Estado = "vigente" | "programada" | "pausada" | "vencida" | "hoy_no";

function estadoDe(o: OfertaFila, ahora: number): Estado {
  if (!o.activa) return "pausada";
  if (o.hasta && Date.parse(o.hasta) <= ahora) return "vencida";
  if (o.desde && Date.parse(o.desde) > ahora) return "programada";
  return "vigente";
}
const NOMBRE: Record<Estado, string> = { vigente: "En pantalla", programada: "Programada", pausada: "Pausada", vencida: "Vencida", hoy_no: "Hoy no" };

/** Lista de ofertas del negocio, con crear, editar, pausar y borrar. */
export function Lista({ ofertas, negocio, slug, sucursales, puedeEditar, ahora }: {
  ofertas: OfertaFila[]; negocio: string; slug: string; sucursales: { id: string; nombre: string }[]; puedeEditar: boolean; ahora: number;
}) {
  const [abierta, setAbierta] = useState<string | null>(ofertas.length === 0 && puedeEditar ? "nueva" : null);
  const nombreSuc = new Map(sucursales.map((s) => [s.id, s.nombre]));
  const orden: Estado[] = ["vigente", "programada", "pausada", "vencida"];
  const filas = [...ofertas].sort((a, b) => orden.indexOf(estadoDe(a, ahora)) - orden.indexOf(estadoDe(b, ahora)) || a.orden - b.orden);

  return (
    <>
      {puedeEditar && (
        <div className="of-barra">
          <button className="boton" type="button" onClick={() => setAbierta(abierta === "nueva" ? null : "nueva")}>Nueva oferta</button>
        </div>
      )}
      {abierta === "nueva" && (
        <section className="tarjeta"><h2>Nueva oferta</h2>
          <FormOferta o={null} negocio={negocio} slug={slug} sucursales={sucursales} onCerrar={ofertas.length ? () => setAbierta(null) : undefined} /></section>
      )}
      {filas.length === 0 ? (
        abierta !== "nueva" && <p className="quieto">Todavía no hay ofertas.</p>
      ) : (
        <ul className="of-lista">
          {filas.map((o) => {
            const e = estadoDe(o, ahora);
            const cuando = cuandoOferta({ ...o, productos: [] } as unknown as Oferta);
            return (
              <li key={o.id} className={`tarjeta of-item ${e}`}>
                <div className="of-cabeza">
                  {o.imagen && <img src={o.imagen} alt="" />}
                  <div className="of-quien">
                    <h3>{o.nombre}</h3>
                    <p className="quieto pequeno">
                      {o.tipo === "precio" ? "Precio especial" : o.tipo === "aviso" ? "Anuncio" : textoOferta(o as unknown as Oferta)}
                      {o.tipo !== "aviso" && ` · ${o.productos.length} ${o.productos.length === 1 ? "producto" : "productos"}`}
                      {o.sucursales?.length ? ` · ${o.sucursales.map((s) => nombreSuc.get(s) ?? "—").join(", ")}` : " · todas las sucursales"}
                    </p>
                    {cuando && <p className="quieto pequeno">{cuando[0].toUpperCase() + cuando.slice(1)}</p>}
                  </div>
                  <span className={`chip of-estado ${e}`}>{NOMBRE[e]}</span>
                </div>
                {puedeEditar && (
                  <div className="fila of-acciones">
                    <button type="button" className="boton secundario" onClick={() => setAbierta(abierta === o.id ? null : o.id)}>{abierta === o.id ? "Cerrar" : "Editar"}</button>
                    <form action={pausarOferta}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="activa" value={o.activa ? "0" : "1"} />
                      <button className="boton secundario" type="submit">{o.activa ? "Pausar" : "Activar"}</button></form>
                    <form action={borrarOferta} onSubmit={(ev) => { if (!confirm(`¿Borrar la oferta «${o.nombre}»?`)) ev.preventDefault(); }}>
                      <input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={o.id} />
                      <button className="boton secundario peligro" type="submit">Borrar</button></form>
                  </div>
                )}
                {abierta === o.id && <FormOferta o={o} negocio={negocio} slug={slug} sucursales={sucursales} onCerrar={() => setAbierta(null)} />}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
