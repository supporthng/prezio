"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FRECUENCIAS, NO_COMPARTIDA, type ColumnasGuardadas } from "@/lib/fuentes";
import {
  compartirPorEnlace, driveConfigurado, elegirArchivoDrive, esIos, prepararDrive, enlaceDeArchivo, nombreSinExtension, type ArchivoDrive,
} from "@/lib/googleDrive";
import { crearGoogle, listarDrive, quitarGoogleDrive, revisarGoogle, type Revision } from "./fuentes";
import type { ArchivoLista } from "@/lib/googleServidor";

type Cuenta = { id: string; correo: string };
type Props = { negocioId: string; slug: string; nombresUsados: string[]; cuentas?: Cuenta[]; driveServidor?: boolean };

/** Nuevo inventario que se llena solo desde una hoja de Google o un Excel en Drive. */
export function FuenteGoogle({ negocioId, slug, nombresUsados, cuentas = [], driveServidor = false }: Props) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [revision, setRevision] = useState<Extract<Revision, { ok: true }> | null>(null);
  const [columnas, setColumnas] = useState<ColumnasGuardadas | null>(null);
  const [nombre, setNombre] = useState("");
  const [cada, setCada] = useState(60);
  const [estado, setEstado] = useState<{ tipo: "error" | "bien" | "trabajando"; texto: string } | null>(null);
  const [elegido, setElegido] = useState<ArchivoDrive | null>(null);
  const elegidoRef = useRef<ArchivoDrive | null>(null);   // lo mismo que «elegido», para leerlo dentro de revisar()
  const [sinCompartir, setSinCompartir] = useState(false);
  const trabajando = estado?.tipo === "trabajando";
  // Google Drive conectado desde el servidor: Prezcio muestra la lista (funciona en Safari).
  const [cuenta, setCuenta] = useState<string>("");          // conexión usada por la hoja elegida
  const [lista, setLista] = useState<{ cuenta: string; archivos: ArchivoLista[] | null; buscar: string; error?: string } | null>(null);
  const abrirLista = async (id: string, buscar = "") => {
    setLista({ cuenta: id, archivos: null, buscar });
    const r = await listarDrive(id, buscar);
    setLista({ cuenta: id, archivos: r.ok ? r.archivos : [], buscar, error: r.ok ? undefined : r.error });
  };
  const conectar = () => {
    const volver = window.location.pathname + "#t-google";
    window.location.assign(`/api/google/conectar?negocio=${encodeURIComponent(negocioId)}&volver=${encodeURIComponent(volver)}`);
  };
  const elegirDeLista = async (a: ArchivoLista) => {
    setLista(null);
    setCuenta(a && lista ? lista.cuenta : "");
    setUrl(a.url);
    setNombre("");
    elegidoRef.current = null; setElegido(null);
    await revisar(a.url, a.nombre.replace(/\.(xlsx|xls|csv)$/i, ""), lista?.cuenta);
  };
  const repetido = nombresUsados.some((n) => n.trim().toLowerCase() === nombre.trim().toLowerCase());

  async function revisar(enlace: string = url, nombreSugerido = "", conCuenta: string = cuenta) {
    setEstado({ tipo: "trabajando", texto: "Leyendo la hoja en Google…" });
    setRevision(null);
    setSinCompartir(false);
    const r = await revisarGoogle(enlace, conCuenta || undefined);
    if (!r.ok) {
      // Elegido desde Drive pero sin compartir por enlace: se ofrece compartirlo con un toque.
      if (r.error === NO_COMPARTIDA && elegidoRef.current) { setSinCompartir(true); setEstado(null); return; }
      setEstado({ tipo: "error", texto: r.error });
      return;
    }
    setRevision(r);
    setColumnas(r.columnas);
    setNombre((n) => n || nombreSugerido || "Hoja de Google");
    setEstado(null);
  }

  const [ios, setIos] = useState(false);
  useEffect(() => { setIos(esIos()); prepararDrive(); }, []);
  // Recién conectada (vuelve de Google con ?google=<id>): se abre la lista de una vez.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("google");
    if (id && cuentas.some((c) => c.id === id)) {
      void abrirLista(id);
      document.getElementById("t-google")?.scrollIntoView({ behavior: "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Elegir el archivo en Google Drive: se llena el enlace y se revisa de una vez. */
  async function elegirDeDrive() {
    setEstado({ tipo: "trabajando", texto: "Abriendo Google Drive…" });
    try {
      const a = await elegirArchivoDrive();
      if (!a) { setEstado(null); return; }
      elegidoRef.current = a;
      setElegido(a);
      const enlace = enlaceDeArchivo(a);
      setUrl(enlace);
      setNombre("");
      await revisar(enlace, nombreSinExtension(a.nombre));
    } catch (e) {
      setEstado({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo abrir Google Drive." });
    }
  }

  async function compartirYRevisar() {
    if (!elegido) return;
    setEstado({ tipo: "trabajando", texto: "Compartiendo el archivo por enlace…" });
    const error = await compartirPorEnlace(elegido);
    if (error) { setEstado({ tipo: "error", texto: error }); return; }
    await revisar(enlaceDeArchivo(elegido), nombreSinExtension(elegido.nombre));
  }

  async function crear() {
    if (!columnas) return;
    setEstado({ tipo: "trabajando", texto: "Creando el inventario y cargando los productos…" });
    const r = await crearGoogle({ negocioId, slug, nombre, url, columnas, cada_min: cada, cuenta: cuenta || undefined });
    if (!r.ok) { setEstado({ tipo: "error", texto: r.error }); router.refresh(); return; }
    setEstado({ tipo: "bien", texto: `Listo: ${r.productos.toLocaleString("es-DO")} productos. Se actualizará solo ${FRECUENCIAS.find((f) => f.min === cada)?.texto}.` });
    setRevision(null); setUrl(""); setNombre(""); setCuenta("");
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
        Una hoja de Google o un Excel guardado en Google Drive que se actualiza solo.
        {driveServidor ? " Conecta tu Google Drive y elige la hoja de la lista, o pega su enlace." : <> Elígelo desde Google Drive o, en Google, toca <strong>Compartir › Acceso general › Cualquier persona con el enlace</strong> y pega el enlace.</>}
      </p>
      {driveServidor && (
        <div className="drive-cuentas">
          {cuentas.length === 0 ? (
            <p style={{ margin: "0 0 14px" }}>
              <button className="boton" type="button" onClick={conectar} disabled={trabajando}>Conectar Google Drive</button>
              <span className="quieto pequeno" style={{ marginLeft: 10 }}>Una sola vez: Prezcio te muestra tus hojas y las lee solo, sin compartirlas.</span>
            </p>
          ) : (
            <>
              {cuentas.map((c) => (
                <div key={c.id} className="drive-cuenta">
                  <span><span aria-hidden="true">✓</span> Google Drive conectado: <b>{c.correo}</b></span>
                  <span className="fila" style={{ gap: 8, margin: 0 }}>
                    <button className="boton" type="button" onClick={() => void abrirLista(c.id)} disabled={trabajando}>Elegir hoja</button>
                    <form action={quitarGoogleDrive} onSubmit={(e) => { if (!window.confirm(`¿Desconectar ${c.correo}? Los inventarios de esa cuenta dejarán de actualizarse.`)) e.preventDefault(); }}>
                      <input type="hidden" name="slug" value={slug} /><input type="hidden" name="cuenta" value={c.id} />
                      <button className="boton secundario" type="submit">Desconectar</button>
                    </form>
                  </span>
                </div>
              ))}
              <p className="pequeno" style={{ margin: "6px 0 14px" }}>
                <button className="enlace" type="button" onClick={conectar}>Conectar otra cuenta de Google</button>
              </p>
            </>
          )}
          {lista && (
            <div className="drive-lista" role="dialog" aria-label="Elige la hoja de Google Drive">
              <div className="fila" style={{ margin: 0, alignItems: "flex-end" }}>
                <div className="campo" style={{ marginBottom: 0, flex: "1 1 220px" }}>
                  <label htmlFor="drive-buscar">Buscar por nombre</label>
                  <input id="drive-buscar" type="search" defaultValue={lista.buscar} placeholder="precios, inventario…"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void abrirLista(lista.cuenta, (e.target as HTMLInputElement).value); } }} />
                </div>
                <button className="boton secundario" type="button" onClick={() => void abrirLista(lista.cuenta, (document.getElementById("drive-buscar") as HTMLInputElement)?.value ?? "")}>Buscar</button>
                <button className="boton secundario" type="button" onClick={() => setLista(null)}>Cerrar</button>
              </div>
              {lista.archivos === null && <p className="quieto" role="status">Buscando tus hojas en Google Drive…</p>}
              {lista.error && <p className="aviso error" role="alert">{lista.error}</p>}
              {lista.archivos && !lista.error && lista.archivos.length === 0 && <p className="quieto">No encontré hojas de Google, Excel ni CSV{lista.buscar ? ` con «${lista.buscar}»` : ""}.</p>}
              {lista.archivos && lista.archivos.length > 0 && (
                <ul className="drive-archivos">
                  {lista.archivos.map((a) => (
                    <li key={a.id}>
                      <button type="button" onClick={() => void elegirDeLista(a)}>
                        <span className={`drive-tipo ${a.mime.includes("google-apps") ? "hoja" : a.mime.includes("csv") ? "csv" : "xlsx"}`}>
                          {a.mime.includes("google-apps") ? "Hoja" : a.mime.includes("csv") ? "CSV" : "Excel"}
                        </span>
                        <span className="drive-nombre">{a.nombre}</span>
                        <span className="drive-fecha">{new Date(a.modificado).toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric" })}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
      {!driveServidor && driveConfigurado() && ios && (
        <p className="quieto pequeno" style={{ margin: "0 0 14px" }}>
          <b>En Safari del iPhone o iPad</b> Google no deja mostrar la lista de tus hojas. Abre esta página en <b>Chrome</b> para elegirla de la lista,
          o pega el enlace: en la app de Google (Hojas de cálculo o Drive) toca <b>Compartir › Acceso general › Cualquier persona con el enlace</b> y copia el enlace.
        </p>
      )}
      {!driveServidor && driveConfigurado() && (
        <p style={{ margin: "0 0 14px" }}>
          <button className="boton" type="button" onClick={elegirDeDrive} disabled={trabajando}>Elegir de Google Drive</button>
          <span className="quieto pequeno" style={{ marginLeft: 10 }}>o pega el enlace abajo</span>
        </p>
      )}
      {!driveServidor && !driveConfigurado() && (
        <p className="quieto pequeno" style={{ margin: "0 0 14px" }}>
          Google Drive todavía no está conectado a Prezcio. Mientras tanto puedes pegar el enlace del archivo.
        </p>
      )}
      {sinCompartir && elegido && (
        <div className="aviso" role="status" style={{ marginBottom: 14 }}>
          <p style={{ margin: "0 0 10px" }}>
            «{elegido.nombre}» es privado. Para que Prezcio lo actualice solo, debe quedar como
            <strong> «Cualquier persona con el enlace · Lector»</strong>. Solo se comparte para leer, no para editar.
          </p>
          <button className="boton" type="button" onClick={compartirYRevisar} disabled={trabajando}>Compartir por enlace y continuar</button>
        </div>
      )}
      <div className="fila">
        <div className="campo" style={{ marginBottom: 0, flex: "3 1 320px" }}>
          <label htmlFor="g-url">Enlace de la hoja</label>
          <input id="g-url" type="url" value={url} onChange={(e) => { setUrl(e.target.value); setRevision(null); setSinCompartir(false); setCuenta(""); elegidoRef.current = null; setElegido(null); }}
            placeholder="https://docs.google.com/spreadsheets/d/…" autoComplete="off" />
        </div>
        <button className="boton secundario" type="button" onClick={() => void revisar()} disabled={!url.trim() || trabajando}>Revisar la hoja</button>
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
