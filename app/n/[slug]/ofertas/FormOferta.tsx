"use client";

import { useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/browser";
import { guardarOferta } from "./actions";

export type OfertaFila = {
  id: string; nombre: string; descripcion: string | null; tipo: "precio" | "porcentaje" | "lleva_paga" | "aviso";
  valor: number | null; lleva: number | null; paga: number | null; imagen: string | null; sucursales: string[] | null;
  desde: string | null; hasta: string | null; dias: number[] | null; hora_desde: string | null; hora_hasta: string | null;
  activa: boolean; orden: number; productos: { codigo: string; precio_oferta: number | null }[];
};

const TIPOS = [
  ["precio", "Precio especial", "Cada producto con su precio de oferta."],
  ["porcentaje", "% de descuento", "El mismo descuento para todos los productos."],
  ["lleva_paga", "Lleva y paga", "Por ejemplo: lleva 3, paga 2."],
  ["aviso", "Solo anuncio", "Una imagen o un texto, sin productos (una feria, un horario…)."],
] as const;
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
/** ISO → «2026-11-30» en la hora del negocio (UTC−4). */
const dia = (iso: string | null) => (iso ? new Date(Date.parse(iso) - 4 * 3600e3).toISOString().slice(0, 10) : "");

export function FormOferta({ o, negocio, slug, sucursales, onCerrar }: {
  o: OfertaFila | null; negocio: string; slug: string; sucursales: { id: string; nombre: string }[]; onCerrar?: () => void;
}) {
  const [tipo, setTipo] = useState<OfertaFila["tipo"]>(o?.tipo ?? "precio");
  const [imagen, setImagen] = useState(o?.imagen ?? "");
  const [subiendo, setSubiendo] = useState("");
  const k = o?.id ?? "nueva";

  async function subir(archivo: File | undefined) {
    if (!archivo) return;
    if (archivo.size > 3 * 1024 * 1024) { setSubiendo("La imagen pesa más de 3 MB."); return; }
    setSubiendo("Subiendo imagen…");
    const ext = (archivo.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const ruta = `${negocio}/ofertas/${crypto.randomUUID()}.${ext}`;
    const sb = supabaseNavegador();
    const { error } = await sb.storage.from("marcas").upload(ruta, archivo, { contentType: archivo.type, cacheControl: "3600" });
    if (error) { setSubiendo("No se pudo subir: " + error.message); return; }
    setImagen(sb.storage.from("marcas").getPublicUrl(ruta).data.publicUrl);
    setSubiendo("");
  }

  const productos = (o?.productos ?? []).map((p) => (p.precio_oferta !== null && tipo === "precio" ? `${p.codigo} ${p.precio_oferta}` : p.codigo)).join("\n");

  return (
    <form action={guardarOferta} className="of-form">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="negocio" value={negocio} />
      {o && <input type="hidden" name="id" value={o.id} />}
      <input type="hidden" name="imagen" value={imagen} />
      <input type="hidden" name="tipo" value={tipo} />

      <fieldset className="of-tipos">
        <legend>Tipo de oferta</legend>
        {TIPOS.map(([v, t, d]) => (
          <label key={v} className={`of-tipo${tipo === v ? " on" : ""}`}>
            <input type="radio" name={`tipo-${k}`} checked={tipo === v} onChange={() => setTipo(v)} />
            <b>{t}</b><small>{d}</small>
          </label>
        ))}
      </fieldset>

      <div className="fila">
        <div className="campo"><label htmlFor={`n-${k}`}>Nombre</label>
          <input id={`n-${k}`} name="nombre" required minLength={2} maxLength={60} defaultValue={o?.nombre} placeholder="Fin de semana refrescante" /></div>
        {tipo === "porcentaje" && (
          <div className="campo" style={{ flex: "0 1 140px" }}><label htmlFor={`v-${k}`}>Descuento (%)</label>
            <input id={`v-${k}`} name="valor" type="number" min={1} max={90} step="0.5" required defaultValue={o?.valor ?? 10} /></div>
        )}
        {tipo === "lleva_paga" && (
          <>
            <div className="campo" style={{ flex: "0 1 110px" }}><label htmlFor={`l-${k}`}>Lleva</label>
              <input id={`l-${k}`} name="lleva" type="number" min={2} max={99} required defaultValue={o?.lleva ?? 3} /></div>
            <div className="campo" style={{ flex: "0 1 110px" }}><label htmlFor={`p-${k}`}>Paga</label>
              <input id={`p-${k}`} name="paga" type="number" min={1} max={98} required defaultValue={o?.paga ?? 2} /></div>
          </>
        )}
      </div>
      <div className="campo"><label htmlFor={`d-${k}`}>Texto corto <small className="quieto">(opcional)</small></label>
        <input id={`d-${k}`} name="descripcion" maxLength={140} defaultValue={o?.descripcion ?? ""} placeholder="En todos los refrescos de 2 litros" /></div>

      {tipo !== "aviso" && (
        <div className="campo">
          <label htmlFor={`pr-${k}`}>Productos <small className="quieto">— {tipo === "precio" ? "un código por línea y su precio de oferta: «7501055363063 99.50»" : "un código de barras por línea"}</small></label>
          <textarea id={`pr-${k}`} name="productos" rows={5} required defaultValue={productos} spellCheck={false}
            placeholder={tipo === "precio" ? "7501055363063 99.50\n7501055300020 95" : "7501055363063\n042100005264"} />
        </div>
      )}

      <div className="campo">
        <span className="of-et">Imagen <small className="quieto">(opcional; se ve grande en el carrusel)</small></span>
        <div className="of-imagen">
          {imagen ? <img src={imagen} alt="" /> : <span className="quieto pequeno">Sin imagen</span>}
          <input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Subir imagen" onChange={(e) => void subir(e.target.files?.[0])} />
          {imagen && <button type="button" className="enlace-boton" onClick={() => setImagen("")}>Quitar</button>}
        </div>
        {subiendo && <p className="pequeno quieto" role="status">{subiendo}</p>}
      </div>

      <p className="of-et">Cuándo</p>
      <div className="fila">
        <div className="campo"><label htmlFor={`de-${k}`}>Desde <small className="quieto">(vacío = ya)</small></label><input id={`de-${k}`} name="desde" type="date" defaultValue={dia(o?.desde ?? null)} /></div>
        <div className="campo"><label htmlFor={`ha-${k}`}>Hasta <small className="quieto">(incluido; vacío = sin fin)</small></label><input id={`ha-${k}`} name="hasta" type="date" defaultValue={o?.hasta ? dia(new Date(Date.parse(o.hasta) - 1000).toISOString()) : ""} /></div>
        <div className="campo" style={{ flex: "0 1 130px" }}><label htmlFor={`hd-${k}`}>De la hora</label><input id={`hd-${k}`} name="hora_desde" type="time" defaultValue={o?.hora_desde?.slice(0, 5) ?? ""} /></div>
        <div className="campo" style={{ flex: "0 1 130px" }}><label htmlFor={`hh-${k}`}>A la hora</label><input id={`hh-${k}`} name="hora_hasta" type="time" defaultValue={o?.hora_hasta?.slice(0, 5) ?? ""} /></div>
      </div>
      <div className="of-dias" role="group" aria-label="Días de la semana (ninguno = todos)">
        {DIAS.map((t, i) => (
          <label key={t}><input type="checkbox" name="dias" value={i} defaultChecked={o?.dias?.includes(i)} /><span>{t}</span></label>
        ))}
        <small className="quieto">Ninguno marcado = todos los días.</small>
      </div>

      {sucursales.length > 1 && (
        <>
          <p className="of-et">Sucursales <small className="quieto">(ninguna marcada = todas)</small></p>
          <div className="of-dias">
            {sucursales.map((s) => (
              <label key={s.id}><input type="checkbox" name="sucursales" value={s.id} defaultChecked={o?.sucursales?.includes(s.id)} /><span>{s.nombre}</span></label>
            ))}
          </div>
        </>
      )}

      <div className="fila" style={{ alignItems: "center" }}>
        <label className="of-check"><input type="checkbox" name="activa" defaultChecked={o?.activa ?? true} /> Activa</label>
        <div className="campo" style={{ flex: "0 1 120px" }}><label htmlFor={`o-${k}`}>Orden en el carrusel</label><input id={`o-${k}`} name="orden" type="number" defaultValue={o?.orden ?? 100} /></div>
      </div>
      <div className="fila">
        <button className="boton" type="submit" disabled={Boolean(subiendo) && subiendo.startsWith("Subiendo")}>{o ? "Guardar cambios" : "Crear oferta"}</button>
        {onCerrar && <button className="boton secundario" type="button" onClick={onCerrar}>Cancelar</button>}
      </div>
    </form>
  );
}
