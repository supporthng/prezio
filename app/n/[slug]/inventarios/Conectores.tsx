"use client";

import { useState } from "react";
import { crearConector, crearInventarioConector, quitarConector } from "./fuentes";

export type ConectorFila = {
  id: string; nombre: string; visto: string | null; version: string | null; equipo: string | null; error: string | null;
  inventarios: string[];
};
type Props = { negocioId: string; slug: string; conectores: ConectorFila[]; sitio: string; descarga: string; nombresUsados: string[] };

function hace(iso: string | null): string {
  if (!iso) return "todavía no se ha conectado";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "conectado ahora";
  if (min < 60) return `hace ${min} min`;
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} días`;
}

/** Conectores de SQL Server: cada uno con su clave (se ve una sola vez) y los inventarios que llena. */
export function Conectores({ negocioId, slug, conectores, sitio, descarga, nombresUsados }: Props) {
  const [nombre, setNombre] = useState("");
  const [clave, setClave] = useState<{ nombre: string; clave: string } | null>(null);
  const [error, setError] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [nombreInv, setNombreInv] = useState("");
  const repetido = nombresUsados.some((n) => n.trim().toLowerCase() === nombreInv.trim().toLowerCase());

  async function crear() {
    setTrabajando(true); setError("");
    const r = await crearConector(negocioId, slug, nombre.trim() || "Conector");
    setTrabajando(false);
    if (!r.ok) { setError(r.error); return; }
    setClave({ nombre: nombre.trim() || "Conector", clave: r.clave });
    setNombre(""); setCopiado(false);
  }

  return (
    <section className="tarjeta" aria-labelledby="t-conector" style={{ marginTop: 20 }}>
      <h2 id="t-conector">Conectar el sistema de facturación</h2>
      <p className="quieto" style={{ marginTop: 0 }}>
        Para precios que salen de una base de datos (SQL Server, MySQL / MariaDB, PostgreSQL o Firebird).
      </p>
      <ol className="pequeno" style={{ margin: "0 0 16px", paddingLeft: "1.2em", lineHeight: 1.7 }}>
        <li>En una PC de la misma red que el servidor, instala <a href={descarga}>Prezio Administrador</a>.</li>
        <li>Entra con la licencia del negocio, tu usuario y tu clave.</li>
        <li>En «Base de datos», toca «Buscar servidores en mi red», elige el tuyo y autoriza con el usuario y la clave de la base.</li>
        <li>Elige la tabla de productos y sus columnas: la app crea el inventario y envía los precios sola, cada pocos minutos.</li>
      </ol>
      <p className="quieto pequeno">
        Cada PC que envía precios aparece aquí como un conector. Si se pierde la PC, quítalo y su clave deja de servir.
      </p>

      {clave && (
        <div className="clave-una-vez" role="status">
          <p style={{ margin: "0 0 8px" }}><strong>Clave de «{clave.nombre}»</strong>. Cópiala ahora: no se vuelve a mostrar.</p>
          <div className="fila" style={{ alignItems: "center" }}>
            <code className="clave-texto">{clave.clave}</code>
            <button className="boton secundario" type="button"
              onClick={async () => { await navigator.clipboard?.writeText(clave.clave).catch(() => {}); setCopiado(true); }}>
              {copiado ? "Copiada" : "Copiar"}
            </button>
          </div>
          <ol className="pequeno" style={{ margin: "12px 0 0", paddingLeft: "1.2em", lineHeight: 1.6 }}>
            <li>Es para el conector de consola (PrezioConector.exe): ejecútalo con <code>--configurar</code>, escribe la dirección <strong>{sitio}</strong> y pega esta clave.</li>
            <li>Con Prezio Administrador no hace falta: entra con tu usuario y conecta la base desde «Base de datos».</li>
          </ol>
          <button className="boton secundario" type="button" style={{ marginTop: 12 }} onClick={() => setClave(null)}>Ya la guardé</button>
        </div>
      )}

      {conectores.length > 0 && (
        <ul className="lista" style={{ marginBottom: 16 }}>
          {conectores.map((c) => (
            <li key={c.id}>
              <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                <p style={{ margin: "0 0 2px", fontWeight: 650 }}>{c.nombre}{c.equipo && <span className="quieto"> · {c.equipo}</span>}</p>
                <p className="quieto pequeno" style={{ margin: 0 }}>
                  {hace(c.visto)}{c.version && ` · versión ${c.version}`}
                  {" · "}{c.inventarios.length ? `llena: ${c.inventarios.join(", ")}` : "sin inventarios todavía"}
                </p>
                {c.error && <p className="error-campo" style={{ margin: "4px 0 0" }}>Último error: {c.error}</p>}
              </div>
              <form action={quitarConector}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="conector" value={c.id} />
                <button className="boton secundario peligro" type="submit">Quitar</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <div className="fila">
        <div className="campo" style={{ marginBottom: 0 }}>
          <label htmlFor="c-nombre">Conector con clave (avanzado, sin la app)</label>
          <input id="c-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} placeholder="Ej.: PC de caja" />
        </div>
        <button className="boton secundario" type="button" onClick={crear} disabled={trabajando}>Crear conector y clave</button>
      </div>
      {error && <p className="aviso error" role="alert" style={{ marginTop: 12, marginBottom: 0 }}>{error}</p>}

      {conectores.length > 0 && (
        <form action={crearInventarioConector} className="fila" style={{ marginTop: 20 }}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="negocio" value={negocioId} />
          <div className="campo" style={{ marginBottom: 0 }}>
            <label htmlFor="ci-nombre">Inventario que llena el conector</label>
            <input id="ci-nombre" name="nombre" value={nombreInv} onChange={(e) => setNombreInv(e.target.value)} maxLength={80} required placeholder="Ej.: Precios del sistema" />
          </div>
          <div className="campo" style={{ marginBottom: 0 }}>
            <label htmlFor="ci-conector">Conector</label>
            <select id="ci-conector" name="conector">{conectores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
          </div>
          <button className="boton" type="submit" disabled={repetido || !nombreInv.trim()}>Crear inventario</button>
        </form>
      )}
      {repetido && <p className="error-campo">Ya existe un inventario con ese nombre.</p>}
    </section>
  );
}
