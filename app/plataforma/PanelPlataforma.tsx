"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Aviso } from "@/components/Aviso";
import { estadoLicencia, fechaCorta, type EstadoLicencia } from "@/lib/licencia";
import { agregarDueno, altaNegocio, extenderPrueba, registrarPago, suspender } from "./actions";

type Dueno = { usuario: string | null; correo: string | null; confirmado: boolean };
export type NegocioPl = {
  id: string; nombre: string; slug: string; plan: string; moneda: string; creado: string; duenos: Dueno[];
  licencia: string; prueba_hasta: string | null; pagado_hasta: string | null; bloqueado: boolean;
  usuarios: number; sucursales: number; equipos: number; equipos_activos: number; productos: number; ultima_consulta: string | null;
};
type Filtro = "todos" | "activos" | "prueba" | "vencen" | "bloqueados";
type Orden = "recientes" | "vencen" | "nombre";

const nf = new Intl.NumberFormat("es-DO");
const fecha = (t: string | null) => (t ? fechaCorta(new Date(t)) : "—");
const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

function quitarTildes(t: string) { return t.normalize("NFD").replace(/[̀-ͯ]/g, ""); }
function direccionDe(nombre: string) {
  const s = quitarTildes(nombre).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
  return s.length >= 3 ? s : "";
}
function claveNueva() {
  const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const b = new Uint32Array(12);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => letras[x % letras.length]).join("");
}
function sumarMeses(d: Date, m: number) { const r = new Date(d); r.setMonth(r.getMonth() + m); return r; }

function medidor(n: NegocioPl, lic: EstadoLicencia): { pct: number; tono: "ok" | "alerta" | "mal" | "quieto"; texto: string } {
  if (lic.estado === "suspendida") return { pct: 100, tono: "quieto", texto: "Suspendida a mano" };
  if (lic.estado === "vencida") { const d = Math.abs(lic.dias ?? 0); return { pct: 100, tono: "mal", texto: d > 0 ? `Venció hace ${dias(d)}` : "Venció hoy" }; }
  if (lic.dias === null) return { pct: 100, tono: "ok", texto: "Sin fecha de vencimiento" };
  const total = n.plan === "prueba" ? 30 : 90;
  return { pct: Math.max(5, Math.min(100, (lic.dias / total) * 100)), tono: lic.dias <= 7 ? "alerta" : "ok", texto: `Quedan ${dias(lic.dias)}` };
}

/* ---------------------------------------------------------------- piezas */

function Segmentos<T extends string>({ valor, opciones, onCambia, etiqueta }: { valor: T; opciones: [T, string][]; onCambia: (v: T) => void; etiqueta: string }) {
  return (
    <div className="pl-seg" role="radiogroup" aria-label={etiqueta}>
      {opciones.map(([v, t]) => (
        <button key={v} type="button" role="radio" aria-checked={valor === v} className={valor === v ? "on" : ""} onClick={() => onCambia(v)}>{t}</button>
      ))}
    </div>
  );
}

function CamposDueno({ id }: { id: string }) {
  const [acceso, setAcceso] = useState<"usuario" | "correo">("usuario");
  const [clave, setClave] = useState("");
  const [ver, setVer] = useState(false);
  return (
    <div className="pl-dueno">
      <Segmentos etiqueta="Acceso del dueño" valor={acceso} onCambia={setAcceso}
        opciones={[["usuario", "Usuario y clave"], ["correo", "Invitar por correo"]]} />
      <input type="hidden" name="acceso" value={acceso} />
      <p className="quieto pequeno">{acceso === "usuario" ? "Tú le entregas el usuario y la clave." : "Recibe un correo y elige su propia clave."}</p>
      <div className="campo">
        <label htmlFor={`${id}-nombre`}>Nombre del dueño</label>
        <input id={`${id}-nombre`} name="dueno_nombre" maxLength={80} placeholder="Ej.: Rosa Pérez" />
      </div>
      {acceso === "usuario" ? (
        <div className="fila">
          <div className="campo">
            <label htmlFor={`${id}-usuario`}>Usuario</label>
            <input id={`${id}-usuario`} name="usuario" maxLength={30} pattern="[a-z0-9][a-z0-9._\-]{2,29}" placeholder="rosa" autoComplete="off" />
          </div>
          <div className="campo">
            <label htmlFor={`${id}-clave`}>Clave (mínimo 8)</label>
            <div className="pl-clave">
              <input id={`${id}-clave`} name="clave" type={ver ? "text" : "password"} minLength={8} autoComplete="new-password" spellCheck={false} value={clave} onChange={(e) => setClave(e.target.value)} />
              <button type="button" className="boton secundario" onClick={() => setVer((v) => !v)}>{ver ? "Ocultar" : "Ver"}</button>
              <button type="button" className="boton secundario" onClick={() => { setClave(claveNueva()); setVer(true); }}>Generar</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="campo">
          <label htmlFor={`${id}-correo`}>Correo del dueño</label>
          <input id={`${id}-correo`} name="correo" type="email" required placeholder="dueno@negocio.com" />
        </div>
      )}
    </div>
  );
}

/** Cajón lateral para dar de alta un negocio, en dos pasos y con la licencia a la vista. */
function AltaNegocio({ abierto, cerrar }: { abierto: boolean; cerrar: () => void }) {
  const [paso, setPaso] = useState<1 | 2>(1);
  const [nombre, setNombre] = useState("");
  const [slug, setSlug] = useState("");
  const [tocado, setTocado] = useState(false);
  const [error, setError] = useState("");
  const primero = useRef<HTMLInputElement>(null);
  const vence = useMemo(() => fechaCorta(new Date(Date.now() + 30 * 864e5)), []);

  useEffect(() => {
    if (!abierto) return;
    const t = setTimeout(() => primero.current?.focus(), 80);
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    window.addEventListener("keydown", tecla);
    document.body.style.overflow = "hidden";
    return () => { clearTimeout(t); window.removeEventListener("keydown", tecla); document.body.style.overflow = ""; };
  }, [abierto, cerrar]);

  const siguiente = () => {
    if (nombre.trim().length < 2) { setError("Escribe el nombre del negocio (mínimo 2 letras)."); primero.current?.focus(); return; }
    setError(""); setPaso(2);
  };
  if (!abierto) return null;
  return (
    <div className="pl-velo" onMouseDown={(e) => { if (e.target === e.currentTarget) cerrar(); }}>
      <aside className="pl-cajon" role="dialog" aria-modal="true" aria-labelledby="pl-t-alta">
        <header>
          <div>
            <p className="pl-sobre">Nuevo negocio · paso {paso} de 2</p>
            <h2 id="pl-t-alta">{paso === 1 ? "¿Cómo se llama el negocio?" : "¿Quién será el dueño?"}</h2>
          </div>
          <button type="button" className="pl-x" onClick={cerrar} aria-label="Cerrar">×</button>
        </header>
        <div className="pl-pasos" aria-hidden="true"><i className="on" /><i className={paso === 2 ? "on" : ""} /></div>

        <div className="pl-licencia-vista">
          <span>Licencia</span>
          <code>PREZIO-XXXX-XXXX-XXXX</code>
          <small>{nombre.trim() ? <><b>{nombre.trim()}</b> · </> : null}30 días de prueba · hasta {vence}</small>
        </div>

        <form action={altaNegocio} onKeyDown={(e) => { if (e.key === "Enter" && paso === 1 && (e.target as HTMLElement).tagName === "INPUT") { e.preventDefault(); siguiente(); } }}>
          <div hidden={paso !== 1}>
            <div className="campo">
              <label htmlFor="pl-nombre">Nombre del negocio</label>
              <input id="pl-nombre" name="nombre" ref={primero} required minLength={2} maxLength={80} placeholder="Ej.: Ferretería Los Pinos" value={nombre} autoComplete="off"
                onChange={(e) => { setNombre(e.target.value); if (!tocado) setSlug(direccionDe(e.target.value)); }} />
            </div>
            <div className="fila">
              <div className="campo" style={{ flex: "2 1 200px" }}>
                <label htmlFor="pl-slug">Dirección <small className="quieto">(se arma sola)</small></label>
                <input id="pl-slug" name="slug" maxLength={40} pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" placeholder="ferreteria-los-pinos" autoComplete="off" value={slug}
                  onChange={(e) => { setTocado(true); setSlug(e.target.value.toLowerCase()); }} />
              </div>
              <div className="campo" style={{ flex: "0 1 110px" }}>
                <label htmlFor="pl-moneda">Moneda</label>
                <input id="pl-moneda" name="moneda" defaultValue="RD$" maxLength={6} />
              </div>
            </div>
            <p className="quieto pequeno">Su página será <code>/n/{slug || "direccion"}</code>. Nace con su sucursal Principal y todas las funciones.</p>
            {error && <p className="aviso error" role="alert">{error}</p>}
            <div className="pl-pie"><button type="button" className="boton" onClick={siguiente}>Siguiente</button></div>
          </div>
          <div hidden={paso !== 2}>
            <CamposDueno id="alta" />
            <div className="pl-pie">
              <button type="button" className="boton secundario" onClick={() => setPaso(1)}>Atrás</button>
              <button type="submit" className="boton">Dar de alta</button>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}

function Tarjeta({ n, ahora, indice }: { n: NegocioPl; ahora: number; indice: number }) {
  const lic = estadoLicencia(n, ahora);
  const med = medidor(n, lic);
  const [panel, setPanel] = useState<null | "pago" | "prueba" | "dueno">(null);
  const [copiado, setCopiado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [plan, setPlan] = useState<"basico" | "profesional">(n.plan === "profesional" ? "profesional" : "basico");
  const [meses, setMeses] = useState<"1" | "3" | "6" | "12">("1");
  const [extra, setExtra] = useState<"7" | "15" | "30">("15");
  const suspendido = n.plan === "suspendido";

  const base = n.plan !== "prueba" && n.pagado_hasta && Date.parse(n.pagado_hasta) > ahora ? new Date(n.pagado_hasta) : new Date(ahora);
  const nuevaFecha = fechaCorta(sumarMeses(base, Number(meses)));

  const copiar = async () => {
    try { await navigator.clipboard.writeText(n.licencia); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch { /* sin portapapeles */ }
  };
  const abrir = (p: "pago" | "prueba" | "dueno") => setPanel((a) => (a === p ? null : p));

  return (
    <li className={`pl-negocio estado-${lic.estado}`} style={{ animationDelay: `${Math.min(indice, 10) * 45}ms` }}>
      <div className="pl-cabeza">
        <div className="pl-ini" aria-hidden="true">{n.nombre.trim().slice(0, 1).toUpperCase()}</div>
        <div className="pl-quien">
          <h3>{n.nombre}</h3>
          <p className="quieto pequeno">/n/{n.slug} · desde {fecha(n.creado)}</p>
        </div>
        <span className={`pl-estado ${lic.estado}`}>{lic.estado === "activa" ? "Activa" : lic.estado === "prueba" ? "En prueba" : lic.estado === "vencida" ? "Vencida" : "Suspendida"}</span>
      </div>

      <button type="button" className={`pl-codigo${copiado ? " ok" : ""}`} onClick={copiar} title="Copiar la licencia">
        <code>{n.licencia}</code><span>{copiado ? "¡Copiada!" : "Copiar"}</span>
      </button>

      <div className={`pl-medidor ${med.tono}`}>
        <div className="pl-barra" role="img" aria-label={med.texto}><i style={{ width: `${med.pct}%` }} /></div>
        <p><b>{med.texto}</b><span>{lic.texto}</span></p>
      </div>

      <dl className="pl-datos">
        <div><dt>Usuarios</dt><dd>{n.usuarios}</dd></div>
        <div><dt>Sucursales</dt><dd>{n.sucursales}</dd></div>
        <div><dt>Verificadores hoy</dt><dd>{n.equipos_activos}<small>/{n.equipos}</small></dd></div>
        <div><dt>Productos</dt><dd>{nf.format(n.productos)}</dd></div>
      </dl>
      <p className="pl-linea"><span>Dueño</span>{n.duenos.length ? n.duenos.map((d, i) => (
        <b key={i}>{d.usuario ?? d.correo}{!d.confirmado && <small className="quieto"> (invitación pendiente)</small>}</b>
      )) : <b className="error-texto">Sin dueño</b>}</p>
      <p className="pl-linea"><span>Última consulta</span><b>{fecha(n.ultima_consulta)}</b></p>

      <div className="pl-acciones">
        <button type="button" className={`pl-tab${panel === "pago" ? " on" : ""}`} aria-expanded={panel === "pago"} onClick={() => abrir("pago")}>Registrar pago</button>
        <button type="button" className={`pl-tab${panel === "prueba" ? " on" : ""}`} aria-expanded={panel === "prueba"} onClick={() => abrir("prueba")}>Días de prueba</button>
        <button type="button" className={`pl-tab${panel === "dueno" ? " on" : ""}`} aria-expanded={panel === "dueno"} onClick={() => abrir("dueno")}>Agregar dueño</button>
        <Link className="pl-tab enlace" href={`/n/${n.slug}`}>Abrir panel ›</Link>
      </div>

      {panel === "pago" && (
        <form action={registrarPago} className="pl-panel">
          <input type="hidden" name="negocio" value={n.id} />
          <input type="hidden" name="plan" value={plan} />
          <input type="hidden" name="meses" value={meses} />
          <p className="pl-et">Plan</p>
          <Segmentos etiqueta="Plan" valor={plan} onCambia={setPlan} opciones={[["basico", "Básico"], ["profesional", "Profesional"]]} />
          <p className="pl-et">Tiempo pagado</p>
          <Segmentos etiqueta="Tiempo" valor={meses} onCambia={setMeses} opciones={[["1", "1 mes"], ["3", "3 meses"], ["6", "6 meses"], ["12", "1 año"]]} />
          <p className="pl-resultado">Quedará activo hasta el <b>{nuevaFecha}</b></p>
          <div className="campo">
            <label htmlFor={`pn-${n.id}`}>Nota <small className="quieto">(opcional)</small></label>
            <input id={`pn-${n.id}`} name="nota" maxLength={200} placeholder="Ej.: transferencia 0042" />
          </div>
          <button className="boton" type="submit">Registrar pago</button>
        </form>
      )}
      {panel === "prueba" && (
        <form action={extenderPrueba} className="pl-panel">
          <input type="hidden" name="negocio" value={n.id} />
          <input type="hidden" name="dias" value={extra} />
          <p className="pl-et">Días de prueba extra</p>
          <Segmentos etiqueta="Días" valor={extra} onCambia={setExtra} opciones={[["7", "7 días"], ["15", "15 días"], ["30", "30 días"]]} />
          <button className="boton" type="submit">Dar {extra} días</button>
        </form>
      )}
      {panel === "dueno" && (
        <form action={agregarDueno} className="pl-panel">
          <input type="hidden" name="negocio" value={n.id} />
          <input type="hidden" name="slug" value={n.slug} />
          <CamposDueno id={`d-${n.id}`} />
          <button className="boton" type="submit">Agregar dueño</button>
        </form>
      )}

      <form action={suspender} className="pl-suspender">
        <input type="hidden" name="negocio" value={n.id} />
        <input type="hidden" name="accion" value={suspendido ? "reactivar" : "suspender"} />
        {suspendido ? (
          <button className="boton" type="submit">Quitar suspensión</button>
        ) : confirmar ? (
          <>
            <span className="quieto pequeno">¿Suspender «{n.nombre}»? Sus verificadores dejarán de dar precios.</span>
            <button className="boton peligro" type="submit">Sí, suspender</button>
            <button className="boton secundario" type="button" onClick={() => setConfirmar(false)}>Cancelar</button>
          </>
        ) : (
          <button className="boton secundario peligro" type="button" onClick={() => setConfirmar(true)}>Suspender</button>
        )}
      </form>
    </li>
  );
}

/* ---------------------------------------------------------------- pantalla */

export function PanelPlataforma({ negocios, ahora, error, bien, claveProblema, q }: {
  negocios: NegocioPl[]; ahora: number; error?: string; bien?: string; claveProblema?: string | null; q?: string;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [orden, setOrden] = useState<Orden>("recientes");
  const [busca, setBusca] = useState(q ?? "");
  const [alta, setAlta] = useState(false);
  const [aviso, setAviso] = useState(true);

  const info = useMemo(() => negocios.map((n) => ({ n, lic: estadoLicencia(n, ahora) })), [negocios, ahora]);
  const cuenta = useMemo(() => ({
    todos: info.length,
    activos: info.filter((x) => x.lic.estado === "activa").length,
    prueba: info.filter((x) => x.lic.estado === "prueba").length,
    vencen: info.filter((x) => !x.lic.bloqueado && x.lic.dias !== null && x.lic.dias <= 7).length,
    bloqueados: info.filter((x) => x.lic.bloqueado).length,
  }), [info]);
  const equipos = negocios.reduce((t, n) => t + n.equipos_activos, 0);

  const lista = useMemo(() => {
    const t = quitarTildes(busca.trim().toLowerCase());
    const f = info.filter(({ n, lic }) => {
      if (filtro === "activos" && lic.estado !== "activa") return false;
      if (filtro === "prueba" && lic.estado !== "prueba") return false;
      if (filtro === "vencen" && !(!lic.bloqueado && lic.dias !== null && lic.dias <= 7)) return false;
      if (filtro === "bloqueados" && !lic.bloqueado) return false;
      if (!t) return true;
      return quitarTildes(`${n.nombre} ${n.slug} ${n.licencia} ${n.duenos.map((d) => d.usuario ?? d.correo ?? "").join(" ")}`.toLowerCase()).includes(t);
    });
    return [...f].sort((a, b) => {
      if (orden === "nombre") return a.n.nombre.localeCompare(b.n.nombre, "es");
      if (orden === "vencen") return (a.lic.dias ?? 99999) - (b.lic.dias ?? 99999);
      return Date.parse(b.n.creado) - Date.parse(a.n.creado);
    });
  }, [info, filtro, orden, busca]);

  const kpis: { k: string; v: number; t: string; f?: Filtro; tono: string }[] = [
    { k: "negocios", v: cuenta.todos, t: "Negocios", f: "todos", tono: "azul" },
    { k: "activos", v: cuenta.activos, t: "Con licencia activa", f: "activos", tono: "verde" },
    { k: "vencen", v: cuenta.vencen, t: "Vencen esta semana", f: "vencen", tono: "ambar" },
    { k: "equipos", v: equipos, t: "Verificadores hoy", tono: "azul" },
  ];
  const chips: [Filtro, string][] = [["todos", "Todos"], ["activos", "Activos"], ["prueba", "En prueba"], ["vencen", "Por vencer"], ["bloqueados", "Bloqueados"]];

  return (
    <main className="pl-pagina">
      <section className="pl-hero">
        <div className="pl-hero-fila">
          <div>
            <p className="pl-sobre">Prezio · administración</p>
            <h1>Plataforma</h1>
            <p className="pl-sub">Negocios, licencias y vigencia en un solo lugar.</p>
          </div>
          <button type="button" className="pl-nuevo" onClick={() => setAlta(true)}><b>+</b> Nuevo negocio</button>
        </div>
        <div className="pl-kpis">
          {kpis.map((x) => (
            x.f ? (
              <button key={x.k} type="button" className={`pl-kpi ${x.tono}${filtro === x.f ? " on" : ""}`} onClick={() => setFiltro(x.f!)}>
                <b>{nf.format(x.v)}</b><span>{x.t}</span>
              </button>
            ) : (
              <div key={x.k} className={`pl-kpi ${x.tono}`}><b>{nf.format(x.v)}</b><span>{x.t}</span></div>
            )
          ))}
        </div>
      </section>

      {aviso && (error || bien) && (
        <div className="pl-aviso" onClick={() => setAviso(false)} title="Toca para cerrar"><Aviso error={error} bien={bien} /></div>
      )}
      {claveProblema && <p className="aviso error">{claveProblema} Sin ella no se pueden crear las cuentas de los dueños.</p>}

      <section aria-label="Negocios">
        <div className="pl-barra-herr">
          <div className="pl-buscar">
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar negocio, licencia o dueño" aria-label="Buscar" />
          </div>
          <label className="pl-orden">Ordenar
            <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
              <option value="recientes">Más recientes</option>
              <option value="vencen">Vencen primero</option>
              <option value="nombre">Nombre</option>
            </select>
          </label>
        </div>
        <div className="pl-filtros" role="tablist" aria-label="Filtrar">
          {chips.map(([f, t]) => (
            <button key={f} type="button" role="tab" aria-selected={filtro === f} className={filtro === f ? "on" : ""} onClick={() => setFiltro(f)}>
              {t} <span>{cuenta[f]}</span>
            </button>
          ))}
        </div>

        {lista.length === 0 ? (
          <div className="pl-vacio">
            <p><b>{negocios.length === 0 ? "Todavía no hay negocios" : "Ningún negocio coincide"}</b></p>
            <p className="quieto">{negocios.length === 0 ? "Da de alta el primero y le generas su licencia." : "Prueba con otro filtro o con otra búsqueda."}</p>
            {negocios.length === 0
              ? <button type="button" className="boton" onClick={() => setAlta(true)}>Dar de alta un negocio</button>
              : <button type="button" className="boton secundario" onClick={() => { setFiltro("todos"); setBusca(""); }}>Quitar filtros</button>}
          </div>
        ) : (
          <ul className="pl-lista">
            {lista.map(({ n }, i) => <Tarjeta key={n.id} n={n} ahora={ahora} indice={i} />)}
          </ul>
        )}
      </section>

      <AltaNegocio abierto={alta} cerrar={() => setAlta(false)} />
    </main>
  );
}
