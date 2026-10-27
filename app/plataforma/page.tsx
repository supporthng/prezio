import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Barra } from "@/components/Barra";
import { Aviso } from "@/components/Aviso";
import { supabaseServidor } from "@/lib/supabase/server";
import { problemaClaveSecreta } from "@/lib/supabase/admin";
import { agregarDueno, altaNegocio, extenderPrueba, registrarPago, suspender } from "./actions";
import { estadoLicencia } from "@/lib/licencia";

export const metadata = { title: "Plataforma" };
export const dynamic = "force-dynamic";

type Dueno = { usuario: string | null; correo: string | null; confirmado: boolean };
type Negocio = {
  id: string; nombre: string; slug: string; plan: string; moneda: string; creado: string; duenos: Dueno[];
  licencia: string; prueba_hasta: string | null; pagado_hasta: string | null; bloqueado: boolean;
  usuarios: number; sucursales: number; equipos: number; equipos_activos: number; productos: number; ultima_consulta: string | null;
};
type Props = { searchParams: Promise<{ bien?: string; error?: string; q?: string }> };

const fecha = (t: string | null) => (t ? new Date(t).toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric" }) : "—");
const nf = new Intl.NumberFormat("es-DO");

/** Campos del dueño: usuario y clave, o invitación por correo (se muestran según la opción elegida). */
function CamposDueno({ id }: { id: string }) {
  return (
    <fieldset className="acceso-dueno">
      <legend>Acceso del dueño</legend>
      <div className="opciones">
        <label className="opcion"><input type="radio" name="acceso" value="usuario" defaultChecked id={`${id}-u`} /><span>Usuario y clave <small className="quieto">· se los entregas tú</small></span></label>
        <label className="opcion"><input type="radio" name="acceso" value="correo" id={`${id}-c`} /><span>Invitar por correo <small className="quieto">· elige su clave</small></span></label>
      </div>
      <div className="campo">
        <label htmlFor={`${id}-nombre`}>Nombre del dueño</label>
        <input id={`${id}-nombre`} name="dueno_nombre" maxLength={80} placeholder="Ej.: Rosa Pérez" />
      </div>
      <div className="fila solo-usuario">
        <div className="campo">
          <label htmlFor={`${id}-usuario`}>Usuario</label>
          <input id={`${id}-usuario`} name="usuario" maxLength={30} pattern="[a-z0-9][a-z0-9._\-]{2,29}" placeholder="rosa" autoComplete="off" />
        </div>
        <div className="campo">
          <label htmlFor={`${id}-clave`}>Clave (mínimo 8)</label>
          <input id={`${id}-clave`} name="clave" type="text" minLength={8} autoComplete="off" spellCheck={false} />
        </div>
      </div>
      <div className="campo solo-correo">
        <label htmlFor={`${id}-correo`}>Correo del dueño</label>
        <input id={`${id}-correo`} name="correo" type="email" placeholder="dueno@negocio.com" />
      </div>
    </fieldset>
  );
}

export default async function Plataforma({ searchParams }: Props) {
  const { bien, error, q } = await searchParams;
  const supabase = await supabaseServidor();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/entrar?siguiente=/plataforma");
  const { data: es } = await supabase.rpc("es_plataforma");
  if (!es) notFound();
  const { data } = await supabase.rpc("plataforma_negocios");
  const todos = (data ?? []) as Negocio[];
  const filtro = (q ?? "").trim().toLowerCase();
  const negocios = filtro ? todos.filter((n) => `${n.nombre} ${n.slug} ${n.licencia} ${n.duenos.map((d) => d.usuario ?? d.correo).join(" ")}`.toLowerCase().includes(filtro)) : todos;
  const activos = todos.filter((n) => !n.bloqueado).length;
  const porVencer = todos.filter((n) => { const e = estadoLicencia(n); return !e.bloqueado && e.dias !== null && e.dias <= 7; }).length;
  const equipos = todos.reduce((t, n) => t + n.equipos_activos, 0);

  return (
    <>
      <Barra />
      <main className="contenido">
        <h1>Plataforma</h1>
        <p className="quieto">
          {nf.format(todos.length)} negocios · {nf.format(activos)} activos · {nf.format(porVencer)} por vencer esta semana · {nf.format(equipos)} verificadores conectados hoy
        </p>
        <Aviso error={error} bien={bien} />
        {problemaClaveSecreta() && (
          <p className="aviso error">{problemaClaveSecreta()} Sin ella no se pueden crear las cuentas de los dueños.</p>
        )}

        <section className="tarjeta" aria-labelledby="t-alta">
          <h2 id="t-alta">Dar de alta un negocio</h2>
          <p className="quieto pequeno">Nace con su licencia PREZIO-XXXX-XXXX-XXXX, 30 días de prueba, su sucursal Principal y todas las funciones. Al vencer la prueba queda bloqueado hasta que registres el pago.</p>
          <form action={altaNegocio}>
            <div className="fila">
              <div className="campo" style={{ flex: "2 1 240px" }}>
                <label htmlFor="nombre">Nombre del negocio</label>
                <input id="nombre" name="nombre" required minLength={2} maxLength={80} placeholder="Ej.: Abarrotao Market" />
              </div>
              <div className="campo" style={{ flex: "1 1 200px" }}>
                <label htmlFor="slug">Dirección <small className="quieto">(opcional)</small></label>
                <input id="slug" name="slug" maxLength={40} pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" placeholder="abarrotao-market" autoComplete="off" />
              </div>
              <div className="campo" style={{ flex: "0 1 110px" }}>
                <label htmlFor="moneda">Moneda</label>
                <input id="moneda" name="moneda" defaultValue="RD$" maxLength={6} />
              </div>

            </div>
            <CamposDueno id="alta" />
            <button className="boton" type="submit">Dar de alta</button>
          </form>
        </section>

        <section aria-labelledby="t-negocios" style={{ marginTop: 28 }}>
          <div className="fila" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
            <h2 id="t-negocios" style={{ margin: 0 }}>Negocios</h2>
            <form method="get" className="plat-buscar">
              <input name="q" defaultValue={q ?? ""} placeholder="Buscar negocio, licencia o dueño" aria-label="Buscar" />
              <button className="boton secundario" type="submit">Buscar</button>
            </form>
          </div>
          {negocios.length === 0 ? (
            <p className="quieto">{filtro ? "Ningún negocio coincide." : "Todavía no hay negocios: da de alta el primero arriba."}</p>
          ) : (
            <ul className="plat-lista">
              {negocios.map((n) => { const lic = estadoLicencia(n); return (
                <li key={n.id} className={`tarjeta plat-negocio${n.bloqueado ? " suspendido" : ""}`}>
                  <div className="plat-cabeza">
                    <div>
                      <h3>{n.nombre}</h3>
                      <p className="plat-licencia"><code>{n.licencia}</code></p>
                      <p className="quieto pequeno">/n/{n.slug} · desde {fecha(n.creado)}</p>
                    </div>
                    <span className={`chip${n.bloqueado ? " plan-suspendido" : lic.estado === "activa" ? " plan-profesional" : ""}`}>{lic.texto}</span>
                  </div>
                  <dl className="plat-datos">
                    <div><dt>Dueño</dt><dd>{n.duenos.length ? n.duenos.map((d, i) => (
                      <span key={i}>{d.usuario ? <>usuario <strong>{d.usuario}</strong></> : d.correo}{!d.confirmado && <small className="quieto"> (invitación pendiente)</small>}</span>
                    )) : <span className="error-texto">Sin dueño</span>}</dd></div>
                    <div><dt>Usuarios</dt><dd>{n.usuarios}</dd></div>
                    <div><dt>Sucursales</dt><dd>{n.sucursales}</dd></div>
                    <div><dt>Verificadores</dt><dd>{n.equipos_activos} de {n.equipos} hoy</dd></div>
                    <div><dt>Productos</dt><dd>{nf.format(n.productos)}</dd></div>
                    <div><dt>Última consulta</dt><dd>{fecha(n.ultima_consulta)}</dd></div>
                  </dl>
                  <div className="plat-acciones">
                    <Link className="boton secundario" href={`/n/${n.slug}`}>Abrir panel</Link>
                    <details className="plat-dueno">
                      <summary>Registrar pago</summary>
                      <form action={registrarPago} className="fila">
                        <input type="hidden" name="negocio" value={n.id} />
                        <div className="campo" style={{ flex: "0 1 160px" }}><label htmlFor={`pp-${n.id}`}>Plan</label>
                          <select id={`pp-${n.id}`} name="plan" defaultValue={n.plan === "profesional" ? "profesional" : "basico"}>
                            <option value="basico">Básico</option><option value="profesional">Profesional</option>
                          </select></div>
                        <div className="campo" style={{ flex: "0 1 140px" }}><label htmlFor={`pm-${n.id}`}>Tiempo</label>
                          <select id={`pm-${n.id}`} name="meses" defaultValue="1">
                            <option value="1">1 mes</option><option value="3">3 meses</option><option value="6">6 meses</option><option value="12">1 año</option>
                          </select></div>
                        <div className="campo"><label htmlFor={`pn-${n.id}`}>Nota <small className="quieto">(opcional)</small></label>
                          <input id={`pn-${n.id}`} name="nota" maxLength={200} placeholder="Ej.: transferencia 0042" /></div>
                        <button className="boton" type="submit" style={{ marginBottom: 12 }}>Registrar pago</button>
                      </form>
                      <p className="quieto pequeno" style={{ marginTop: 0 }}>Se suma desde hoy, o desde la fecha pagada si todavía no vence.</p>
                    </details>
                    <details className="plat-dueno">
                      <summary>Días de prueba</summary>
                      <form action={extenderPrueba} className="plat-plan">
                        <input type="hidden" name="negocio" value={n.id} />
                        <select name="dias" defaultValue="15" aria-label="Días de prueba extra">
                          <option value="7">7 días</option><option value="15">15 días</option><option value="30">30 días</option>
                        </select>
                        <button className="boton secundario" type="submit">Dar días de prueba</button>
                      </form>
                    </details>
                    <details className="plat-dueno">
                      <summary>Agregar dueño</summary>
                      <form action={agregarDueno}>
                        <input type="hidden" name="negocio" value={n.id} />
                        <input type="hidden" name="slug" value={n.slug} />
                        <CamposDueno id={`d-${n.id}`} />
                        <button className="boton" type="submit">Agregar dueño</button>
                      </form>
                    </details>
                    <form action={suspender} style={{ marginLeft: "auto" }}>
                      <input type="hidden" name="negocio" value={n.id} />
                      <input type="hidden" name="accion" value={n.plan === "suspendido" ? "reactivar" : "suspender"} />
                      <button className={`boton secundario${n.plan === "suspendido" ? "" : " peligro"}`} type="submit">
                        {n.plan === "suspendido" ? "Quitar suspensión" : "Suspender"}
                      </button>
                    </form>
                  </div>
                </li>
              ); })}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
