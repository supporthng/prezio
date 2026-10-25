"use client";

import { useState } from "react";
import { Pantalla, type EstadoPantalla } from "@/components/Pantalla";
import { ESTILOS, type Apariencia, type Estilo } from "@/lib/apariencia";
import { supabaseNavegador } from "@/lib/supabase/browser";
import { guardarApariencia, guardarImagen } from "./actions";

type Props = { negocioId: string; slug: string; negocio: string; sucursal: string; inicial: Apariencia; moneda: string; puedeEditar: boolean };

const VISTAS = {
  espera: "Esperando",
  producto: "Con precio",
  no: "No encontrado",
} as const;

export function Editor({ negocioId, slug, negocio, sucursal, inicial, moneda: monedaInicial, puedeEditar }: Props) {
  const [a, setA] = useState<Apariencia>(inicial);
  const [moneda, setMoneda] = useState(monedaInicial);
  const [vista, setVista] = useState<keyof typeof VISTAS>("espera");
  const [vertical, setVertical] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cambiar = <K extends keyof Apariencia>(k: K, v: Apariencia[K]) => { setA((x) => ({ ...x, [k]: v })); setAviso(null); };
  const cambios = JSON.stringify(a) !== JSON.stringify(inicial) || moneda !== monedaInicial;

  const estado: EstadoPantalla = vista === "producto"
    ? { tipo: "producto", codigo: "7501055363063", nombre: "Refresco de cola 2 litros", precio: 125.5, vez: 1 }
    : vista === "no" ? { tipo: "no", codigo: "7460855230237" } : { tipo: "espera" };

  async function subir(cual: "logo" | "qr", archivo: File | undefined) {
    if (!archivo) return;
    if (archivo.size > 2 * 1024 * 1024) { setAviso({ ok: false, mensaje: "La imagen pesa más de 2 MB." }); return; }
    setAviso({ ok: true, mensaje: "Subiendo imagen…" });
    const ext = (archivo.type.split("/")[1] || "png").replace("svg+xml", "svg").replace("jpeg", "jpg");
    const ruta = `${negocioId}/${cual}.${ext}`;
    const supabase = supabaseNavegador();
    const { error } = await supabase.storage.from("marcas").upload(ruta, archivo, { upsert: true, contentType: archivo.type, cacheControl: "60" });
    if (error) { setAviso({ ok: false, mensaje: "No se pudo subir la imagen: " + error.message }); return; }
    const url = supabase.storage.from("marcas").getPublicUrl(ruta).data.publicUrl + `?v=${Date.now()}`;
    const r = await guardarImagen(negocioId, slug, cual, url);
    if (r.ok) setA((x) => ({ ...x, [cual]: url, [cual === "logo" ? "mostrar_logo" : "mostrar_qr"]: true }));
    setAviso(r);
  }
  async function quitar(cual: "logo" | "qr") {
    const r = await guardarImagen(negocioId, slug, cual, null);
    if (r.ok) setA((x) => ({ ...x, [cual]: null }));
    setAviso(r);
  }

  async function guardar() {
    setGuardando(true);
    const r = await guardarApariencia(negocioId, slug, a, moneda);
    setGuardando(false);
    setAviso(r);
  }

  const casilla = (k: "mostrar_nombre" | "mostrar_sucursal" | "mostrar_logo" | "mostrar_qr", texto: string) => (
    <label className="opcion" style={{ flex: "1 1 100%", padding: "10px 12px" }}>
      <input type="checkbox" checked={a[k]} disabled={!puedeEditar} onChange={(e) => cambiar(k, e.target.checked)} />
      <span>{texto}</span>
    </label>
  );

  return (
    <div className="editor-apariencia">
      <div className="editor-ajustes">
        {aviso && <p className={`aviso ${aviso.ok ? "bien" : "error"}`}>{aviso.mensaje}</p>}
        <fieldset disabled={!puedeEditar} style={{ border: 0, padding: 0, margin: 0 }}>
          <h2>Estilo</h2>
          <div className="opciones" style={{ flexDirection: "column" }}>
            {(Object.keys(ESTILOS) as Estilo[]).map((e) => (
              <label key={e} className="opcion" style={{ flex: "1 1 auto" }}>
                <input type="radio" name="estilo" checked={a.estilo === e} onChange={() => cambiar("estilo", e)} />
                <span><strong>{ESTILOS[e].nombre}</strong><br /><span className="quieto pequeno">{ESTILOS[e].detalle}</span></span>
              </label>
            ))}
          </div>
          <div className="fila" style={{ marginTop: 16 }}>
            <div className="campo">
              <label htmlFor="color">Color del negocio</label>
              <input id="color" type="color" value={a.color_marca} onChange={(e) => cambiar("color_marca", e.target.value)} style={{ padding: 4, height: 46 }} />
            </div>
            <div className="campo">
              <label htmlFor="moneda">Moneda</label>
              <input id="moneda" value={moneda} maxLength={6} onChange={(e) => { setMoneda(e.target.value); setAviso(null); }} />
            </div>
          </div>

          <h2 style={{ marginTop: 8 }}>Logo y QR</h2>
          <div className="fila">
            <div className="campo">
              <label htmlFor="logo">Logo (PNG o JPG, máx. 2 MB)</label>
              <div className="imagen-actual">
                {a.logo ? <img src={a.logo} alt="Logo actual" /> : <span className="quieto pequeno">Sin logo</span>}
                {a.logo && puedeEditar && <button type="button" className="enlace-boton" onClick={() => void quitar("logo")}>Quitar</button>}
              </div>
              <input id="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => void subir("logo", e.target.files?.[0])} />
              {!a.logo && <p className="aviso error" style={{ margin: "8px 0 0" }}>Todavía no has subido el logo: las pantallas muestran solo el nombre.</p>}
              {a.logo && !a.mostrar_logo && <p className="aviso error" style={{ margin: "8px 0 0" }}>El logo está oculto: marca «Logo del negocio» abajo y guarda.</p>}
            </div>
            <div className="campo">
              <label htmlFor="qr">Código QR (opcional)</label>
              <div className="imagen-actual">
                {a.qr ? <img src={a.qr} alt="QR actual" /> : <span className="quieto pequeno">Sin QR</span>}
                {a.qr && puedeEditar && <button type="button" className="enlace-boton" onClick={() => void quitar("qr")}>Quitar</button>}
              </div>
              <input id="qr" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => void subir("qr", e.target.files?.[0])} />
              <p className="quieto pequeno" style={{ margin: "6px 0 0" }}>O usa el QR de la consulta desde el celular: Sucursales › Enlace y QR.</p>
            </div>
          </div>
          <div className="opciones">
            <label className="opcion"><input type="radio" name="pos" checked={a.posicion_logo === "esquina"} onChange={() => cambiar("posicion_logo", "esquina")} /><span>Logo arriba, en la esquina</span></label>
            <label className="opcion"><input type="radio" name="pos" checked={a.posicion_logo === "centro"} onChange={() => cambiar("posicion_logo", "centro")} /><span>Logo grande, en el centro</span></label>
          </div>

          <h2 style={{ marginTop: 20 }}>Qué se muestra</h2>
          <div className="opciones">
            {casilla("mostrar_logo", "Logo del negocio")}
            {casilla("mostrar_nombre", "Nombre del negocio")}
            {casilla("mostrar_sucursal", "Nombre de la sucursal debajo")}
            {casilla("mostrar_qr", "Código QR")}
          </div>

          <h2 style={{ marginTop: 20 }}>Textos</h2>
          <div className="campo"><label htmlFor="t1">Mensaje principal</label>
            <input id="t1" value={a.titulo_espera} maxLength={60} onChange={(e) => cambiar("titulo_espera", e.target.value)} /></div>
          <div className="campo"><label htmlFor="t2">Indicación debajo</label>
            <input id="t2" value={a.mensaje_espera} maxLength={90} onChange={(e) => cambiar("mensaje_espera", e.target.value)} /></div>
          <div className="campo"><label htmlFor="t3">Texto junto al QR</label>
            <input id="t3" value={a.texto_qr} maxLength={60} onChange={(e) => cambiar("texto_qr", e.target.value)} /></div>
          <div className="campo"><label htmlFor="seg">Segundos que se ve el precio: {a.segundos}</label>
            <input id="seg" type="range" min={4} max={30} value={a.segundos} onChange={(e) => cambiar("segundos", Number(e.target.value))} style={{ padding: 0, minHeight: 0 }} /></div>
        </fieldset>
        {puedeEditar && (
          <button className="boton" type="button" disabled={!cambios || guardando} onClick={() => void guardar()}>
            {guardando ? "Guardando…" : "Guardar apariencia"}
          </button>
        )}
      </div>

      <div className="editor-vista">
        <div className="fila" style={{ marginBottom: 12, alignItems: "center" }}>
          <div className="opciones" role="radiogroup" aria-label="Vista previa">
            {(Object.keys(VISTAS) as (keyof typeof VISTAS)[]).map((v) => (
              <label key={v} className="opcion" style={{ flex: "0 0 auto", padding: "8px 12px" }}>
                <input type="radio" name="vista" checked={vista === v} onChange={() => setVista(v)} /><span>{VISTAS[v]}</span>
              </label>
            ))}
          </div>
          <label className="pequeno" style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 500, margin: 0 }}>
            <input type="checkbox" checked={vertical} onChange={(e) => setVertical(e.target.checked)} style={{ width: "auto", minHeight: 0 }} /> Pantalla vertical
          </label>
        </div>
        <div className={`marco-vista${vertical ? " vertical" : ""}`}>
          <Pantalla apariencia={a} moneda={moneda} negocio={negocio} sucursal={sucursal} estado={estado} vistaPrevia />
        </div>
        <p className="quieto pequeno" style={{ marginTop: 8 }}>Así se verá en los verificadores (con la sucursal «{sucursal}» de ejemplo).</p>
      </div>
    </div>
  );
}
