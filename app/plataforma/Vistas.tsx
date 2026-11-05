"use client";

import { useEffect, useState } from "react";
import { fechaCorta, limitesPlan, precioPlan, textoLicencia, type EstadoLic, type Plan } from "@/lib/licencia";
import { atenderSolicitud, borrarPlan, guardarAjustes, guardarPlan, historialNegocio, liberarPc, ponerUsuario, quitarUsuario } from "./actions";

export type Ajustes = {
  contacto_nombre: string | null; contacto_telefono: string | null; contacto_whatsapp: string | null; contacto_correo: string | null;
  contacto_horario: string | null; dias_prueba: number; dias_aviso: number; dias_gracia: number; plazo_horas: number; descuento_anual: number;
  moneda: string; prueba_sucursales: number | null; prueba_equipos: number | null; prueba_usuarios: number | null; prueba_pcs: number | null;
};
export type Solicitud = {
  id: string; negocio_id: string; negocio: string; slug: string; licencia: string; plan: string; plan_nombre: string | null; meses: number;
  contacto: string | null; telefono: string | null; correo: string | null; mensaje: string | null; origen: "panel" | "app";
  estado: "nueva" | "contactada" | "aprobada" | "rechazada" | "cancelada"; creado: string; actual: EstadoLic;
};
export type MiembroPl = { id: string; correo: string; rol: "administrador" | "ventas" | "soporte"; yo: boolean };
export type DatosPl = { rol: MiembroPl["rol"]; planes: Plan[]; ajustes: Ajustes; solicitudes: Solicitud[]; equipo: MiembroPl[] | null };

const Vista = ({ v }: { v: string }) => <input type="hidden" name="vista" value={v} />;
const textoMeses = (m: number) => (m === 0 ? "pago único" : m % 12 === 0 ? `${m / 12} ${m === 12 ? "año" : "años"}` : `${m} ${m === 1 ? "mes" : "meses"}`);
const hace = (iso: string) => {
  const h = Math.round((Date.now() - Date.parse(iso)) / 3600e3);
  return h < 1 ? "hace un momento" : h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
};

/* ---------------------------------------------------------------- solicitudes */

function TarjetaSolicitud({ s, escribe, plazo }: { s: Solicitud; escribe: boolean; plazo: number }) {
  const [accion, setAccion] = useState<null | "aprobar" | "rechazar">(null);
  const abierta = s.estado === "nueva" || s.estado === "contactada";
  const atrasada = s.estado === "nueva" && Date.now() - Date.parse(s.creado) > plazo * 3600e3;
  const wa = s.telefono?.replace(/\D/g, "");
  return (
    <li className={`pl-negocio pl-sol ${s.estado}${atrasada ? " atrasada" : ""}`}>
      <div className="pl-sol-cabeza">
        <div>
          <h3>{s.negocio}</h3>
          <p className="quieto pequeno"><code>{s.licencia}</code> · ahora: {textoLicencia(s.actual)}</p>
        </div>
        <span className={`pl-estado ${s.estado === "nueva" ? "prueba" : s.estado === "aprobada" ? "activa" : s.estado === "contactada" ? "activa" : "suspendida"}`}>
          {{ nueva: "Nueva", contactada: "Contactada", aprobada: "Aprobada", rechazada: "Rechazada", cancelada: "Cancelada" }[s.estado]}
        </span>
      </div>
      <p className="pl-sol-pide">Pide <b>{s.plan_nombre ?? s.plan}</b> · {textoMeses(s.meses)} <span className="quieto pequeno">· {hace(s.creado)} desde {s.origen === "app" ? "la app" : "el panel"}{atrasada ? ` · pasó el plazo de ${plazo} h` : ""}</span></p>
      <p className="pl-linea"><span>Contacto</span><b>{s.contacto ?? "—"}</b>
        {s.telefono && <a href={`tel:${s.telefono.replace(/[^\d+]/g, "")}`}>{s.telefono}</a>}
        {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">WhatsApp</a>}
        {s.correo && <a href={`mailto:${s.correo}`}>{s.correo}</a>}</p>
      {s.mensaje && <p className="pl-sol-msj">«{s.mensaje}»</p>}
      {abierta && escribe && (
        <div className="pl-acciones">
          {s.estado === "nueva" && (
            <form action={atenderSolicitud}><Vista v="solicitudes" /><input type="hidden" name="solicitud" value={s.id} /><input type="hidden" name="accion" value="contactada" />
              <button className="pl-tab" type="submit">Marcar contactada</button></form>
          )}
          <button type="button" className={`pl-tab${accion === "aprobar" ? " on" : ""}`} onClick={() => setAccion((a) => (a === "aprobar" ? null : "aprobar"))}>Aprobar</button>
          <button type="button" className={`pl-tab${accion === "rechazar" ? " on" : ""}`} onClick={() => setAccion((a) => (a === "rechazar" ? null : "rechazar"))}>Rechazar</button>
        </div>
      )}
      {accion && (
        <form action={atenderSolicitud} className="pl-panel">
          <Vista v="solicitudes" /><input type="hidden" name="solicitud" value={s.id} /><input type="hidden" name="accion" value={accion} />
          {accion === "aprobar" && s.meses > 0 && (
            <div className="campo"><label htmlFor={`sm-${s.id}`}>Meses pagados</label>
              <input id={`sm-${s.id}`} name="meses" type="number" min={1} max={36} defaultValue={s.meses} /></div>
          )}
          <div className="campo"><label htmlFor={`sr-${s.id}`}>{accion === "aprobar" ? "Nota del pago" : "Motivo (lo ve el negocio)"} <small className="quieto">{accion === "aprobar" ? "(opcional)" : ""}</small></label>
            <input id={`sr-${s.id}`} name="respuesta" maxLength={300} required={accion === "rechazar"} placeholder={accion === "aprobar" ? "Ej.: transferencia 0042" : "Ej.: no recibimos el pago"} /></div>
          <button className={`boton${accion === "rechazar" ? " peligro" : ""}`} type="submit">{accion === "aprobar" ? "Aprobar y activar el plan" : "Rechazar"}</button>
        </form>
      )}
    </li>
  );
}

export function VistaSolicitudes({ datos, escribe }: { datos: DatosPl; escribe: boolean }) {
  const abiertas = datos.solicitudes.filter((s) => s.estado === "nueva" || s.estado === "contactada");
  const pasadas = datos.solicitudes.filter((s) => !(s.estado === "nueva" || s.estado === "contactada"));
  return (
    <section aria-label="Solicitudes">
      {abiertas.length === 0 ? (
        <div className="pl-vacio"><p><b>No hay solicitudes pendientes</b></p>
          <p className="quieto">Cuando un negocio pide un plan desde su pantalla de Licencia (en la web o en la app), aparece aquí.</p></div>
      ) : (
        <ul className="pl-lista">{abiertas.map((s) => <TarjetaSolicitud key={s.id} s={s} escribe={escribe} plazo={datos.ajustes.plazo_horas} />)}</ul>
      )}
      {pasadas.length > 0 && (
        <details className="pl-pasadas"><summary>Atendidas en los últimos 30 días ({pasadas.length})</summary>
          <ul className="pl-lista">{pasadas.map((s) => <TarjetaSolicitud key={s.id} s={s} escribe={false} plazo={datos.ajustes.plazo_horas} />)}</ul>
        </details>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- planes */

function FormPlan({ p, admin, onCerrar }: { p: Plan | null; admin: boolean; onCerrar?: () => void }) {
  const nuevo = !p;
  const [permanente, setPermanente] = useState(p?.permanente ?? false);
  return (
    <form action={guardarPlan} className="pl-plan-form">
      <Vista v="planes" />
      <fieldset disabled={!admin}>
        <div className="fila">
          <div className="campo"><label htmlFor={`pc-${p?.codigo ?? "n"}`}>Código</label>
            {nuevo ? <input id="pc-n" name="codigo" required pattern="[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]" placeholder="premium" />
              : <><input id={`pc-${p.codigo}`} value={p.codigo} readOnly /><input type="hidden" name="codigo" value={p.codigo} /></>}</div>
          <div className="campo"><label htmlFor={`pn-${p?.codigo ?? "n"}`}>Nombre</label><input id={`pn-${p?.codigo ?? "n"}`} name="nombre" required minLength={2} maxLength={40} defaultValue={p?.nombre} /></div>
          <div className="campo" style={{ flex: "0 1 120px" }}><label htmlFor={`pp-${p?.codigo ?? "n"}`}>Precio</label><input id={`pp-${p?.codigo ?? "n"}`} name="precio" inputMode="decimal" defaultValue={p ? String(p.precio) : "0"} /></div>
          <div className="campo" style={{ flex: "0 1 150px" }}><label htmlFor={`pr-${p?.codigo ?? "n"}`}>Se cobra</label>
            <select id={`pr-${p?.codigo ?? "n"}`} name="periodo" defaultValue={p?.periodo ?? "mensual"} disabled={permanente}><option value="mensual">Al mes</option><option value="anual">Al año</option></select></div>
        </div>
        <div className="campo"><label htmlFor={`pd-${p?.codigo ?? "n"}`}>Descripción</label><input id={`pd-${p?.codigo ?? "n"}`} name="descripcion" maxLength={200} defaultValue={p?.descripcion ?? ""} /></div>
        <p className="pl-et">Límites <small className="quieto">(vacío = sin límite)</small></p>
        <div className="fila">
          {([["max_sucursales", "Sucursales"], ["max_equipos", "Verificadores"], ["max_usuarios", "Usuarios"], ["max_pcs", "PCs (Administrador)"]] as const).map(([k, t]) => (
            <div className="campo" key={k} style={{ flex: "1 1 120px" }}><label htmlFor={`${k}-${p?.codigo ?? "n"}`}>{t}</label>
              <input id={`${k}-${p?.codigo ?? "n"}`} name={k} type="number" min={k === "max_equipos" ? 0 : 1} defaultValue={p?.[k] ?? (nuevo && k === "max_pcs" ? 1 : "")} /></div>
          ))}
        </div>
        <div className="campo"><label htmlFor={`pf-${p?.codigo ?? "n"}`}>Lo que incluye <small className="quieto">(una línea por función; se muestra en la pantalla de Licencia)</small></label>
          <textarea id={`pf-${p?.codigo ?? "n"}`} name="funciones" rows={3} defaultValue={(p?.funciones ?? []).join("\n")} /></div>
        <div className="fila pl-checks">
          <label><input type="checkbox" name="permanente" checked={permanente} onChange={(e) => setPermanente(e.target.checked)} /> Permanente (pago único, sin vencimiento)</label>
          <label><input type="checkbox" name="destacado" defaultChecked={p?.destacado} /> Destacado</label>
          <label><input type="checkbox" name="activo" defaultChecked={p?.activo ?? true} /> Se ofrece</label>
          <div className="campo" style={{ flex: "0 1 140px" }}><label htmlFor={`pe-${p?.codigo ?? "n"}`}>Etiqueta</label><input id={`pe-${p?.codigo ?? "n"}`} name="etiqueta" maxLength={30} placeholder="Más vendido" defaultValue={p?.etiqueta ?? ""} /></div>
          <div className="campo" style={{ flex: "0 1 90px" }}><label htmlFor={`po-${p?.codigo ?? "n"}`}>Orden</label><input id={`po-${p?.codigo ?? "n"}`} name="orden" type="number" defaultValue={p?.orden ?? 100} /></div>
        </div>
        {admin && (
          <div className="pl-pie">
            {onCerrar && <button type="button" className="boton secundario" onClick={onCerrar}>Cancelar</button>}
            <button className="boton" type="submit">{nuevo ? "Crear plan" : "Guardar"}</button>
          </div>
        )}
      </fieldset>
    </form>
  );
}

export function VistaPlanes({ datos, admin }: { datos: DatosPl; admin: boolean }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const moneda = datos.ajustes.moneda;
  return (
    <section aria-label="Planes">
      <div className="pl-barra-herr">
        <p className="quieto" style={{ margin: 0, flex: 1 }}>Lo que ofreces a los negocios. Precios en {moneda}; el descuento por pagar un año está en Reglas ({datos.ajustes.descuento_anual}%).</p>
        {admin && <button type="button" className="boton" onClick={() => setAbierto(abierto === "nuevo" ? null : "nuevo")}>Nuevo plan</button>}
      </div>
      {abierto === "nuevo" && <div className="tarjeta" style={{ marginTop: 14 }}><FormPlan p={null} admin={admin} onCerrar={() => setAbierto(null)} /></div>}
      <ul className="pl-lista">
        {datos.planes.map((p) => (
          <li key={p.codigo} className={`pl-negocio pl-plan${p.activo ? "" : " apagado"}`}>
            <div className="pl-cabeza">
              <div className="pl-quien">
                <h3>{p.nombre} {p.destacado && <span className="chip etiqueta">{p.etiqueta || "Destacado"}</span>}</h3>
                <p className="quieto pequeno">{p.codigo} · {p.negocios ?? 0} {p.negocios === 1 ? "negocio" : "negocios"}{p.activo ? "" : " · no se ofrece"}</p>
              </div>
              <b className="pl-plan-precio">{precioPlan(p, moneda)}</b>
            </div>
            <p className="pl-linea"><span>Incluye</span>{limitesPlan(p)}</p>
            {p.funciones.length > 0 && <p className="quieto pequeno">{p.funciones.join(" · ")}</p>}
            <div className="pl-acciones">
              <button type="button" className={`pl-tab${abierto === p.codigo ? " on" : ""}`} onClick={() => setAbierto(abierto === p.codigo ? null : p.codigo)}>{admin ? "Editar" : "Ver"}</button>
              {admin && (
                <form action={borrarPlan}><Vista v="planes" /><input type="hidden" name="codigo" value={p.codigo} />
                  <button className="pl-tab" type="submit">{(p.negocios ?? 0) > 0 ? "Dejar de ofrecer" : "Borrar"}</button></form>
              )}
            </div>
            {abierto === p.codigo && <div className="pl-panel"><FormPlan p={p} admin={admin} onCerrar={() => setAbierto(null)} /></div>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------------- reglas */

export function VistaReglas({ a, admin }: { a: Ajustes; admin: boolean }) {
  const campo = (k: keyof Ajustes, t: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="campo"><label htmlFor={`aj-${k}`}>{t}</label><input id={`aj-${k}`} name={k} defaultValue={a[k] ?? ""} {...extra} /></div>
  );
  return (
    <form action={guardarAjustes} className="tarjeta pl-reglas">
      <Vista v="reglas" />
      <fieldset disabled={!admin}>
        <h2>Contacto que ven los negocios</h2>
        <p className="quieto pequeno">Aparece en su pantalla de Licencia, con botones para llamar, escribir por WhatsApp o enviar un correo.</p>
        <div className="fila">{campo("contacto_nombre", "Nombre", { maxLength: 80, placeholder: "Soporte Prezcio" })}{campo("contacto_telefono", "Teléfono", { maxLength: 30, inputMode: "tel" })}
          {campo("contacto_whatsapp", "WhatsApp", { maxLength: 30, inputMode: "tel" })}</div>
        <div className="fila">{campo("contacto_correo", "Correo", { maxLength: 120, type: "email" })}{campo("contacto_horario", "Horario", { maxLength: 120, placeholder: "Lunes a sábado, 8:00 a 6:00" })}</div>
        <h2>Licencias</h2>
        <div className="fila">
          {campo("dias_prueba", "Días de prueba (negocios nuevos)", { type: "number", min: 1, max: 365, required: true })}
          {campo("dias_aviso", "Avisar desde (días antes de vencer)", { type: "number", min: 1, max: 60, required: true })}
          {campo("dias_gracia", "Días de gracia tras vencer", { type: "number", min: 0, max: 60, required: true })}
        </div>
        <div className="fila">
          {campo("plazo_horas", "Respondes solicitudes en (horas)", { type: "number", min: 1, max: 720, required: true })}
          {campo("descuento_anual", "Descuento por pagar un año (%)", { type: "number", min: 0, max: 50, required: true })}
          {campo("moneda", "Moneda de los precios", { maxLength: 6, required: true })}
        </div>
        <h2>Límites de la prueba</h2>
        <p className="quieto pequeno">Vacío = sin límite. Los negocios que ya los pasan conservan lo que tienen; solo no pueden agregar más.</p>
        <div className="fila">
          {campo("prueba_sucursales", "Sucursales", { type: "number", min: 1 })}{campo("prueba_equipos", "Verificadores", { type: "number", min: 0 })}
          {campo("prueba_usuarios", "Usuarios", { type: "number", min: 1 })}{campo("prueba_pcs", "PCs (Administrador)", { type: "number", min: 1 })}
        </div>
        {admin ? <button className="boton" type="submit">Guardar reglas</button> : <p className="quieto pequeno">Solo un administrador de la plataforma cambia las reglas.</p>}
      </fieldset>
    </form>
  );
}

/* ---------------------------------------------------------------- equipo de la plataforma */

export function VistaEquipo({ equipo }: { equipo: MiembroPl[] }) {
  return (
    <section className="tarjeta pl-equipo" aria-label="Equipo de la plataforma">
      <h2>Quién entra a la Plataforma</h2>
      <p className="quieto pequeno"><b>Administrador</b>: todo, también planes, reglas y este equipo. <b>Ventas</b>: altas, pagos, solicitudes y PCs. <b>Soporte</b>: solo mira.</p>
      <ul className="lista">
        {equipo.map((m) => (
          <li key={m.id}>
            <span><strong>{m.correo}</strong>{m.yo && <span className="quieto pequeno"> (tú)</span>}</span>
            <span className="fila" style={{ alignItems: "center" }}>
              <form action={ponerUsuario} className="fila" style={{ alignItems: "center" }}>
                <Vista v="equipo" /><input type="hidden" name="correo" value={m.correo} />
                <select name="rol" defaultValue={m.rol} aria-label={`Rol de ${m.correo}`} disabled={m.yo}>
                  <option value="administrador">Administrador</option><option value="ventas">Ventas</option><option value="soporte">Soporte</option>
                </select>
                {!m.yo && <button className="boton secundario" type="submit">Guardar</button>}
              </form>
              {!m.yo && <form action={quitarUsuario}><Vista v="equipo" /><input type="hidden" name="usuario" value={m.id} /><button className="boton secundario peligro" type="submit">Quitar</button></form>}
            </span>
          </li>
        ))}
      </ul>
      <form action={ponerUsuario} className="fila" style={{ marginTop: 16 }}>
        <Vista v="equipo" />
        <div className="campo"><label htmlFor="eq-correo">Correo</label><input id="eq-correo" name="correo" type="email" required placeholder="vendedor@tuempresa.com" /></div>
        <div className="campo" style={{ flex: "0 1 180px" }}><label htmlFor="eq-rol">Rol</label>
          <select id="eq-rol" name="rol" defaultValue="ventas"><option value="administrador">Administrador</option><option value="ventas">Ventas</option><option value="soporte">Soporte</option></select></div>
        <div className="campo" style={{ flex: "0 0 auto" }}><button className="boton" type="submit">Agregar</button></div>
      </form>
      <p className="quieto pequeno">La persona debe haber entrado una vez a Prezcio con ese correo.</p>
    </section>
  );
}

/* ---------------------------------------------------------------- historial y PCs de un negocio */

const EVENTOS: Record<string, string> = {
  alta: "Alta del negocio", pago: "Pago registrado", plan: "Cambio de plan", prueba: "Días de prueba", suspendida: "Suspendido", reactivada: "Reactivado",
  solicitud: "Pidió un plan", solicitud_aprobada: "Solicitud aprobada", solicitud_rechazada: "Solicitud rechazada", solicitud_cancelada: "Canceló su solicitud",
  pc_activada: "App activada en una PC", pc_liberada: "PC liberada",
};
function detalleEvento(tipo: string, d: Record<string, unknown>, planes: Map<string, string>) {
  const plan = (c: unknown) => planes.get(String(c)) ?? (c === "prueba" ? "Prueba" : c === "suspendido" ? "Suspendido" : String(c ?? ""));
  if (tipo === "pago") return `${plan(d.plan)} · ${textoMeses(Number(d.meses) || 0)}${d.monto ? ` · ${d.monto}` : ""}${d.nota ? ` · ${d.nota}` : ""}`;
  if (tipo === "plan" || tipo === "suspendida" || tipo === "reactivada") return `${plan(d.de)} → ${plan(d.a)}`;
  if (tipo === "prueba") return `+${d.dias} días`;
  if (tipo.startsWith("solicitud") && d.plan) return `${plan(d.plan)}${d.meses ? ` · ${textoMeses(Number(d.meses))}` : ""}${d.respuesta ? ` · ${d.respuesta}` : ""}`;
  if (tipo.startsWith("pc_")) return String(d.pc ?? "");
  return "";
}

export function HistorialNegocio({ negocio, escribe, planes }: { negocio: string; escribe: boolean; planes: Plan[] }) {
  const [h, setH] = useState<Awaited<ReturnType<typeof historialNegocio>> | null>(null);
  useEffect(() => { let vivo = true; void historialNegocio(negocio).then((r) => { if (vivo) setH(r); }); return () => { vivo = false; }; }, [negocio]);
  const nombres = new Map(planes.map((p) => [p.codigo, p.nombre]));
  if (!h) return <div className="pl-panel"><p className="quieto pequeno">Cargando…</p></div>;
  if ("error" in h) return <div className="pl-panel"><p className="aviso error">{String(h.error)}</p></div>;
  const activas = h.pcs.filter((p) => !p.liberada);
  return (
    <div className="pl-panel pl-historial">
      <p className="pl-et">PCs con Prezcio Administrador</p>
      {activas.length === 0 ? <p className="quieto pequeno">Todavía no se activó en ninguna PC.</p> : (
        <ul className="lista">
          {activas.map((p) => (
            <li key={p.id}>
              <span><strong>{p.nombre ?? "PC sin nombre"}</strong><span className="quieto pequeno"> · versión {p.version ?? "—"} · última vez {fechaCorta(p.visto)}</span></span>
              {escribe && <form action={liberarPc}><input type="hidden" name="pc" value={p.id} /><button className="boton secundario" type="submit">Liberar</button></form>}
            </li>
          ))}
        </ul>
      )}
      <p className="pl-et">Historial</p>
      {h.eventos.length === 0 ? <p className="quieto pequeno">Sin movimientos.</p> : (
        <ol className="pl-eventos">
          {h.eventos.map((e, i) => (
            <li key={i}><time>{fechaCorta(e.creado)}</time><b>{EVENTOS[e.tipo] ?? e.tipo}</b><span>{detalleEvento(e.tipo, e.detalle, nombres)}</span>
              {e.quien && <small className="quieto">{e.quien}</small>}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- descargas */

export type AppPublicada = { version: string; url: string; fecha: string; codigo?: number };
export type Apps = Partial<Record<"administrador" | "windows" | "android" | "conector", AppPublicada>>;

const DESCARGAS: { clave: keyof Apps; nombre: string; para: string; detalle: string; archivo: string }[] = [
  { clave: "administrador", nombre: "Prezcio Administrador", para: "PC de la oficina del negocio · Windows 10 u 11",
    detalle: "El panel del negocio en una app, con el conector de la base de datos (SQL Server, MySQL, PostgreSQL, Firebird) y la copia automática de precios. Se activa con la licencia del negocio.",
    archivo: "Instalador_Prezio_Administrador.exe" },
  { clave: "windows", nombre: "Prezcio para Windows", para: "Verificador en PC o pantalla · Windows 10 u 11",
    detalle: "El verificador a pantalla completa, sin barra ni teclas para salir. Funciona sin internet con los precios guardados.",
    archivo: "Instalador_Prezio.exe" },
  { clave: "android", nombre: "Prezcio para Android", para: "Verificador en tableta o teléfono · Android 5 o más nuevo",
    detalle: "El verificador como app de quiosco. Al abrirse por primera vez pide permiso para instalar apps de esta fuente.",
    archivo: "Prezio.apk" },
  { clave: "conector", nombre: "Conector de consola", para: "Servidores sin pantalla · Windows (avanzado)",
    detalle: "El mismo conector de Prezcio Administrador, sin ventana, para dejarlo como servicio. La mayoría de negocios no lo necesita.",
    archivo: "PrezioConector.exe" },
];

function Copiar({ texto, etiqueta = "Copiar enlace" }: { texto: string; etiqueta?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="boton secundario"
      onClick={async () => { try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 1800); } catch { /* sin portapapeles */ } }}>
      {ok ? "¡Copiado!" : etiqueta}
    </button>
  );
}

export function VistaDescargas({ apps, sitio }: { apps: Apps; sitio: string }) {
  const web = `${sitio || ""}/equipo`;
  return (
    <section aria-label="Descargas">
      <p className="quieto" style={{ margin: "14px 0 0" }}>
        Los enlaces son fijos: siempre bajan la última versión, así que puedes mandarlos por WhatsApp o correo. Las apps instaladas se actualizan solas al abrirse.
      </p>
      <ul className="pl-lista pl-descargas">
        {DESCARGAS.map((d) => {
          const a = apps[d.clave];
          return (
            <li key={d.clave} className="pl-negocio">
              <div className="pl-cabeza">
                <div className="pl-quien">
                  <h3>{d.nombre}</h3>
                  <p className="quieto pequeno">{d.para}</p>
                </div>
                {a ? <span className="pl-estado activa">Versión {a.version}</span> : <span className="pl-estado suspendida">Sin publicar</span>}
              </div>
              <p className="pequeno" style={{ margin: 0 }}>{d.detalle}</p>
              {a ? (
                <>
                  <p className="pl-linea"><span>Publicada</span><b>{fechaCorta(a.fecha)}</b><span className="quieto pequeno">{d.archivo}</span></p>
                  <div className="fila">
                    <a className="boton" href={a.url} download>Descargar</a>
                    <Copiar texto={a.url} />
                  </div>
                </>
              ) : (
                <p className="quieto pequeno">Todavía no hay una versión publicada: aparece aquí cuando GitHub termine de compilarla.</p>
              )}
            </li>
          );
        })}
        <li className="pl-negocio">
          <div className="pl-cabeza">
            <div className="pl-quien"><h3>Verificador en el navegador</h3><p className="quieto pequeno">Cualquier equipo con Chrome o Edge · sin instalar</p></div>
            <span className="pl-estado activa">Siempre al día</span>
          </div>
          <p className="pequeno" style={{ margin: 0 }}>Abre esta dirección en el equipo y vincúlalo con el código que muestra. También funciona sin internet después de la primera vez.</p>
          <p className="pl-linea"><span>Dirección</span><b><code>{web}</code></b></p>
          <div className="fila"><a className="boton secundario" href="/equipo" target="_blank" rel="noreferrer">Abrir</a><Copiar texto={web} etiqueta="Copiar dirección" /></div>
        </li>
      </ul>
    </section>
  );
}
