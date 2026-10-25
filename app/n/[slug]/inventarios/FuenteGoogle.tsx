"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FRECUENCIAS, type ColumnasGuardadas } from "@/lib/fuentes";
import { crearGoogle, revisarGoogle, type Revision } from "./fuentes";

type Props = { negocioId: string; slug: string; nombresUsados: string[] };

/** Nuevo inventario que se llena solo desde una hoja de Google o un Excel en Drive. */
export function FuenteGoogle({ negocioId, slug, nombresUsados }: Props) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [revision, setRevision] = useState<Extract<Revision, { ok: true }> | null>(null);
  const [columnas, setColumnas] = useState<ColumnasGuardadas | null>(null);
  const [nombre, setNombre] = useState("");
  const [cada, setCada] = useState(60);
  const [estado, setEstado] = useState<{ tipo: "error" | "bien" | "trabajando"; texto: string } | null>(null);
  const trabajando = estado?.tipo === "trabajando";
  const repetido = nombresUsados.some((n) => n.trim().toLowerCase() === nombre.trim().toLowerCase());

  async function revisar() {
    setEstado({ tipo: "trabajando", texto: "Leyendo la hoja en Google…" });
    setRevision(null);
    const r = await revisarGoogle(url);
    if (!r.ok) { setEstado({ tipo: "error", texto: r.error }); return; }
    setRevision(r);
    setColumnas(r.columnas);
    setNombre((n) => n || "Hoja de Google");
    setEstado(null);
  }

  async function crear() {
    if (!columnas) return;
    setEstado({ tipo: "trabajando", texto: "Creando el inventario y cargando los productos…" });
    const r = await crearGoogle({ negocioId, slug, nombre, url, columnas, cada_min: cada });
    if (!r.ok) { setEstado({ tipo: "error", texto: r.error }); router.refresh(); return; }
    setEstado({ tipo: "bien", texto: `Listo: ${r.productos.toLocaleString("es-DO")} productos. Se actualizará solo ${FRECUENCIAS.find((f) => f.min === cada)?.texto}.` });
    setRevision(null); setUrl(""); setNombre("");
    router.refresh();
  }

  const selector = (clave: keyof ColumnasGuardadas, etiqueta: string) => revision && columnas && (
    <div className="campo" style={{ marginBottom: 0 }}>
      <label htmlFor={`g-col-${clave}`}>{etiqueta}</label>
      <select id={`g-col-${clave}`} value={columnas[clave]} onChange={(e) => setColumnas({ ...columnas, [clave]: e.target.value })}>
        {revision.encabezados.map((t, i) => <option key={i} value={t}>{t}</option>)}
      </select>
    </div>
  );

  return (
    <section className="tarjeta" aria-labelledby="t-google" style={{ marginTop: 20 }}>
      <h2 id="t-google">Inventario desde Google</h2>
      <p className="quieto" style={{ marginTop: 0 }}>
        Una hoja de Google o un Excel guardado en Google Drive que se actualiza solo. En Google toca
        <strong> Compartir › Acceso general › Cualquier persona con el enlace</strong> y copia el enlace.
      </p>
      <div className="fila">
        <div className="campo" style={{ marginBottom: 0, flex: "3 1 320px" }}>
          <label htmlFor="g-url">Enlace de la hoja</label>
          <input id="g-url" type="url" value={url} onChange={(e) => { setUrl(e.target.value); setRevision(null); }}
            placeholder="https://docs.google.com/spreadsheets/d/…" autoComplete="off" />
        </div>
        <button className="boton secundario" type="button" onClick={revisar} disabled={!url.trim() || trabajando}>Revisar la hoja</button>
      </div>

      {revision && columnas && (
        <>
          <p style={{ margin: "16px 0 8px" }}>
            <strong>{revision.validos.toLocaleString("es-DO")} productos</strong> listos
            {revision.descartados > 0 && <span className="quieto"> · {revision.descartados.toLocaleString("es-DO")} filas sin código, nombre o precio</span>}
          </p>
          <div className="desplazable">
            <table className="tabla pequeno">
              <thead><tr>{revision.encabezados.map((t, i) => <th key={i}>{t}</th>)}</tr></thead>
              <tbody>{revision.muestra.map((f, r) => <tr key={r}>{revision.encabezados.map((_, i) => <td key={i}>{f[i] ?? ""}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <div className="fila" style={{ marginTop: 16 }}>
            {selector("codigo", "Código")}
            {selector("nombre", "Nombre")}
            {selector("precio", "Precio")}
          </div>
          <div className="fila" style={{ marginTop: 16 }}>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="g-nombre">Nombre del inventario</label>
              <input id="g-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} />
            </div>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="g-cada">Actualizar</label>
              <select id="g-cada" value={cada} onChange={(e) => setCada(Number(e.target.value))}>
                {FRECUENCIAS.map((f) => <option key={f.min} value={f.min}>{f.texto}</option>)}
              </select>
            </div>
            <button className="boton" type="button" onClick={crear}
              disabled={trabajando || !nombre.trim() || repetido || !revision.validos}>Crear inventario</button>
          </div>
          {repetido && <p className="error-campo">Ya existe un inventario con ese nombre.</p>}
        </>
      )}
      {estado && (
        <p className={estado.tipo === "error" ? "aviso error" : estado.tipo === "bien" ? "aviso bien" : "quieto"}
          role={estado.tipo === "error" ? "alert" : "status"} style={{ marginTop: 16, marginBottom: 0 }}>{estado.texto}</p>
      )}
    </section>
  );
}
