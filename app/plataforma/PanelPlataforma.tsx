"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Aviso } from "@/components/Aviso";
import { fechaCorta, precioPlan, textoLicencia, type EstadoLic, type Limites, type Plan } from "@/lib/licencia";
import { agregarDueno, altaNegocio, extenderPrueba, registrarPago, suspender } from "./actions";
import { HistorialNegocio, VistaDescargas, VistaEquipo, VistaPlanes, VistaReglas, VistaSolicitudes, type Apps, type DatosPl } from "./Vistas";

type Dueno = { usuario: string | null; correo: string | null; confirmado: boolean };
export type NegocioPl = {
  id: string; nombre: string; slug: string; plan: string; moneda: string; creado: string; duenos: Dueno[];
  licencia: string; prueba_hasta: string | null; pagado_hasta: string | null; bloqueado: boolean;
  usuarios: number; sucursales: number; equipos: number; equipos_activos: number; productos: number; ultima_consulta: string | null;
  lic: EstadoLic; limites: Limites; pcs: number; solicitud: "nueva" | "contactada" | null;
};
type Vista = "negocios" | "solicitudes" | "planes" | "reglas" | "descargas" | "equipo";
type Filtro = "todos" | "activos" | "prueba" | "vencen" | "bloqueados" | "piden";
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

function medidor(n: NegocioPl, lic: EstadoLic): { pct: number; tono: "ok" | "alerta" | "mal" | "quieto"; texto: string } {
  if (lic.estado === "suspendida") return { pct: 100, tono: "quieto", texto: "Suspendida a mano" };
  if (lic.estado === "vencida") { const d = Math.abs(lic.dias ?? 0); return { pct: 100, tono: "mal", texto: d > 0 ? `Venció hace ${dias(d)}` : "Venció hoy" }; }
  if (lic.estado === "gracia") return { pct: 100, tono: "mal", texto: `En gracia: ${dias(lic.dias_gracia_quedan ?? 0)} para pagar` };
  if (lic.dias === null) return { pct: 100, tono: "ok", texto: lic.permanente ? "Permanente" : "Sin fecha de vencimiento" };
  const total = n.plan === "prueba" ? 30 : 90;
  return { pct: Math.max(5, Math.min(100, (lic.dias / total) * 100)), tono: lic.dias <= lic.dias_aviso ? "alerta" : "ok", texto: `Quedan ${dias(lic.dias)}` };
}
const vence = (l: EstadoLic) => !l.bloqueado && (l.estado === "gracia" || (l.dias !== null && l.dias <= l.dias_aviso));
const usoTexto = (uso: number, lim: number | null) => (lim === null ? `${uso}` : `${uso}/${lim}`);

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
function AltaNegocio({ abierto, cerrar, diasPrueba }: { abierto: boolean; cerrar: () => void; diasPrueba: number }) {
  const [paso, setPaso] = useState<1 | 2>(1);
  const [nombre, setNombre] = useState("");
  const [slug, setSlug] = useState("");
  const [tocado, setTocado] = useState(false);
  const [error, setError] = useState("");
  const primero = useRef<HTMLInputElement>(null);
  const hasta = useMemo(() => fechaCorta(new Date(Date.now() + diasPrueba * 864e5)), [diasPrueba]);

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
          <code>PREZCIO-XXXX-XXXX-XXXX</code>
          <small>{nombre.trim() ? <><b>{nombre.trim()}</b> · </> : null}{diasPrueba} días de prueba · hasta {hasta}</small>
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

function Tarjeta({ n, ahora, indice, planes, escribe }: { n: NegocioPl; ahora: number; indice: number; planes: Plan[]; escribe: boolean }) {
  const lic = n.lic;
  const med = medidor(n, lic);
  const [panel, setPanel] = useState<null | "pago" | "prueba" | "dueno" | "historial">(null);
  const [copiado, setCopiado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const ofrecidos = planes.filter((p) => p.activo || p.codigo === n.plan);
  const actual = n.plan === "suspendido" ? n.lic.plan_antes : n.plan;
  const [plan, setPlan] = useState<string>(ofrecidos.find((p) => p.codigo === actual)?.codigo ?? ofrecidos[0]?.codigo ?? "");
  const elPlan = planes.find((p) => p.codigo === plan);
  const [meses, setMeses] = useState<"1" | "3" | "6" | "12">("1");
  const [extra, setExtra] = useState<"7" | "15" | "30">("15");
  const suspendido = n.plan === "suspendido";

  const base = n.plan !== "prueba" && n.plan !== "suspendido" && n.pagado_hasta && Date.parse(n.pagado_hasta) > ahora ? new Date(n.pagado_hasta) : new Date(ahora);
  const nuevaFecha = fechaCorta(sumarMeses(base, Number(meses)));

  const copiar = async () => {
    try { await navigator.clipboard.writeText(n.licencia); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch { /* sin portapapeles */ }
  };
  const abrir = (p: "pago" | "prueba" | "dueno" | "historial") => setPanel((a) => (a === p ? null : p));

  return (
    <li className={`pl-negocio estado-${lic.estado}`} style={{ animationDelay: `${Math.min(indice, 10) * 45}ms` }}>
      <div className="pl-cabeza">
        <div className="pl-ini" aria-hidden="true">{n.nombre.trim().slice(0, 1).toUpperCase()}</div>
        <div className="pl-quien">
          <h3>{n.nombre}</h3>
          <p className="quieto pequeno">/n/{n.slug} · desde {fecha(n.creado)}</p>
        </div>
        <span className={`pl-estado ${lic.estado === "por_vencer" ? "activa" : lic.estado === "gracia" ? "vencida" : lic.estado}`}>
          {{ activa: "Activa", por_vencer: "Por vencer", prueba: "En prueba", gracia: "En gracia", vencida: "Vencida", suspendida: "Suspendida" }[lic.estado]}
        </span>
      </div>

      <button type="button" className={`pl-codigo${copiado ? " ok" : ""}`} onClick={copiar} title="Copiar la licencia">
        <code>{n.licencia}</code><span>{copiado ? "¡Copiada!" : "Copiar"}</span>
      </button>

      <div className={`pl-medidor ${med.tono}`}>
        <div className="pl-barra" role="img" aria-label={med.texto}><i style={{ width: `${med.pct}%` }} /></div>
        <p><b>{med.texto}</b><span>{textoLicencia(lic)}</span></p>
      </div>

      <dl className="pl-datos">
        <div><dt>Usuarios</dt><dd>{usoTexto(n.usuarios, n.limites.usuarios)}</dd></div>
        <div><dt>Sucursales</dt><dd>{usoTexto(n.sucursales, n.limites.sucursales)}</dd></div>
        <div><dt>Verificadores hoy</dt><dd>{n.equipos_activos}<small>/{n.equipos}{n.limites.equipos !== null ? ` de ${n.limites.equipos}` : ""}</small></dd></div>
        <div><dt>Productos</dt><dd>{nf.format(n.productos)}</dd></div>
      </dl>
      <p className="pl-linea"><span>Dueño</span>{n.duenos.length ? n.duenos.map((d, i) => (
        <b key={i}>{d.usuario ?? d.correo}{!d.confirmado && <small className="quieto"> (invitación pendiente)</small>}</b>
      )) : <b className="error-texto">Sin dueño</b>}</p>
      <p className="pl-linea"><span>Última consulta</span><b>{fecha(n.ultima_consulta)}</b></p>
      <p className="pl-linea"><span>PCs</span><b>{usoTexto(n.pcs, n.limites.pcs)}</b></p>
      {n.solicitud && <p className="pl-pide">Pidió un plan · {n.solicitud === "nueva" ? "sin contactar" : "contactado"}</p>}

      <div className="pl-acciones">
        {escribe && <>
        <button type="button" className={`pl-tab${panel === "pago" ? " on" : ""}`} aria-expanded={panel === "pago"} onClick={() => abrir("pago")}>Registrar pago</button>
        <button type="button" className={`pl-tab${panel === "prueba" ? " on" : ""}`} aria-expanded={panel === "prueba"} onClick={() => abrir("prueba")}>Días de prueba</button>
        <button type="button" className={`pl-tab${panel === "dueno" ? " on" : ""}`} aria-expanded={panel === "dueno"} onClick={() => abrir("dueno")}>Agregar dueño</button>
        </>}
        <button type="button" className={`pl-tab${panel === "historial" ? " on" : ""}`} aria-expanded={panel === "historial"} onClick={() => abrir("historial")}>Historial y PCs</button>
        <Link className="pl-tab enlace" href={`/n/${n.slug}`}>Abrir panel ›</Link>
      </div>

      {panel === "pago" && (
        <form action={registrarPago} className="pl-panel">
          <input type="hidden" name="negocio" value={n.id} />
          <input type="hidden" name="plan" value={plan} />
          <input type="hidden" name="meses" value={elPlan?.permanente ? "" : meses} />
          <p className="pl-et">Plan</p>
          {ofrecidos.length === 0 ? <p className="quieto pequeno">Crea un plan en la pestaña Planes.</p>
            : <Segmentos etiqueta="Plan" valor={plan} onCambia={setPlan} opciones={ofrecidos.map((p) => [p.codigo, p.nombre] as [string, string])} />}
          {elPlan && <p className="quieto pequeno">{precioPlan(elPlan)}</p>}
          {elPlan?.permanente ? (
            <p className="pl-resultado">Licencia <b>permanente</b>: sin vencimiento.</p>
          ) : (
            <>
              <p className="pl-et">Tiempo pagado</p>
              <Segmentos etiqueta="Tiempo" valor={meses} onCambia={setMeses} opciones={[["1", "1 mes"], ["3", "3 meses"], ["6", "6 meses"], ["12", "1 año"]]} />
              <p className="pl-resultado">Quedará activo hasta el <b>{nuevaFecha}</b></p>
            </>
          )}
          <div className="campo">
            <label htmlFor={`pn-${n.id}`}>Nota <small className="quieto">(opcional)</small></label>
            <input id={`pn-${n.id}`} name="nota" maxLength={200} placeholder="Ej.: transferencia 0042" />
          </div>
          <button className="boton" type="submit" disabled={!elPlan}>Registrar pago</button>
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

      {panel === "historial" && <HistorialNegocio negocio={n.id} escribe={escribe} planes={planes} />}

      {escribe && <form action={suspender} className="pl-suspender">
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
      </form>}
    </li>
  );
}

/* ---------------------------------------------------------------- pantalla */

export function PanelPlataforma({ negocios, datos, apps, sitio, vista: vistaInicial, ahora, error, bien, claveProblema, q }: {
  negocios: NegocioPl[]; datos: DatosPl; apps: Apps; sitio: string; vista?: string; ahora: number; error?: string; bien?: string; claveProblema?: string | null; q?: string;
}) {
  const escribe = datos.rol !== "soporte";
  const admin = datos.rol === "administrador";
  const [vista, setVista] = useState<Vista>((["negocios", "solicitudes", "planes", "reglas", "descargas", "equipo"] as const).find((v) => v === vistaInicial) ?? "negocios");
  const nuevas = datos.solicitudes.filter((s) => s.estado === "nueva").length;
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [orden, setOrden] = useState<Orden>("recientes");
  const [busca, setBusca] = useState(q ?? "");
  const [alta, setAlta] = useState(false);
  const [aviso, setAviso] = useState(true);

  const info = useMemo(() => negocios.map((n) => ({ n, lic: n.lic })), [negocios]);
  const cuenta = useMemo(() => ({
    todos: info.length,
    activos: info.filter((x) => ["activa", "por_vencer"].includes(x.lic.estado)).length,
    prueba: info.filter((x) => x.lic.estado === "prueba").length,
    vencen: info.filter((x) => vence(x.lic)).length,
    bloqueados: info.filter((x) => x.lic.bloqueado).length,
    piden: info.filter((x) => x.n.solicitud).length,
  }), [info]);
  const equipos = negocios.reduce((t, n) => t + n.equipos_activos, 0);

  const lista = useMemo(() => {
    const t = quitarTildes(busca.trim().toLowerCase());
    const f = info.filter(({ n, lic }) => {
      if (filtro === "activos" && !["activa", "por_vencer"].includes(lic.estado)) return false;
      if (filtro === "prueba" && lic.estado !== "prueba") return false;
      if (filtro === "vencen" && !vence(lic)) return false;
      if (filtro === "piden" && !n.solicitud) return false;
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
    { k: "vencen", v: cuenta.vencen, t: "Por vencer o en gracia", f: "vencen", tono: "ambar" },
    { k: "equipos", v: equipos, t: "Verificadores hoy", tono: "azul" },
  ];
  const chips: [Filtro, string][] = [["todos", "Todos"], ["activos", "Activos"], ["prueba", "En prueba"], ["vencen", "Por vencer"], ["bloqueados", "Bloqueados"], ["piden", "Piden plan"]];
  const pestanas: [Vista, string, number?][] = [["negocios", "Negocios"], ["solicitudes", "Solicitudes", nuevas], ["planes", "Planes"], ["reglas", "Reglas"], ["descargas", "Descargas"],
    ...(admin ? [["equipo", "Equipo"] as [Vista, string]] : [])];

  return (
    <main className="pl-pagina">
      <section className="pl-hero">
        <div className="pl-hero-fila">
          <div>
            <p className="pl-sobre">Prezcio · administración</p>
            <h1>Plataforma</h1>
            <p className="pl-sub">Negocios, licencias y vigencia en un solo lugar.</p>
          </div>
          {escribe && <button type="button" className="pl-nuevo" onClick={() => setAlta(true)}><b>+</b> Nuevo negocio</button>}
        </div>
        <div className="pl-kpis">
          {kpis.map((x) => (
            x.f ? (
              <button key={x.k} type="button" className={`pl-kpi ${x.tono}${vista === "negocios" && filtro === x.f ? " on" : ""}`} onClick={() => { setVista("negocios"); setFiltro(x.f!); }}>
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

      <nav className="pl-vistas" aria-label="Secciones de la plataforma">
        {pestanas.map(([v, t, c]) => (
          <button key={v} type="button" aria-current={vista === v ? "page" : undefined} className={vista === v ? "on" : ""} onClick={() => setVista(v)}>
            {t}{c ? <span className="pl-cuenta">{c}</span> : null}
          </button>
        ))}
        {datos.rol !== "administrador" && <span className="pl-rol">Tu rol: {datos.rol}</span>}
      </nav>

      {vista === "solicitudes" && <VistaSolicitudes datos={datos} escribe={escribe} />}
      {vista === "planes" && <VistaPlanes datos={datos} admin={admin} />}
      {vista === "reglas" && <VistaReglas a={datos.ajustes} admin={admin} />}
      {vista === "descargas" && <VistaDescargas apps={apps} sitio={sitio} />}
      {vista === "equipo" && admin && datos.equipo && <VistaEquipo equipo={datos.equipo} />}

      <section aria-label="Negocios" hidden={vista !== "negocios"}>
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
            {lista.map(({ n }, i) => <Tarjeta key={n.id} n={n} ahora={ahora} indice={i} planes={datos.planes} escribe={escribe} />)}
          </ul>
        )}
      </section>

      <AltaNegocio abierto={alta} cerrar={() => setAlta(false)} diasPrueba={datos.ajustes.dias_prueba} />
    </main>
  );
}
