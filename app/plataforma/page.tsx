import { notFound, redirect } from "next/navigation";
import { Barra } from "@/components/Barra";
import { Aviso } from "@/components/Aviso";
import { supabaseServidor } from "@/lib/supabase/server";
import { hayClaveSecreta } from "@/lib/supabase/admin";
import { agregarDueno, altaNegocio, cambiarPlan } from "./actions";

export const metadata = { title: "Plataforma" };
export const dynamic = "force-dynamic";

type Dueno = { usuario: string | null; correo: string | null; confirmado: boolean };
type Negocio = {
  id: string; nombre: string; slug: string; plan: string; moneda: string; creado: string; duenos: Dueno[];
  usuarios: number; sucursales: number; equipos: number; equipos_activos: number; productos: number; ultima_consulta: string | null;
};
type Props = { searchParams: Promise<{ bien?: string; error?: string; q?: string }> };

const PLANES: Record<string, string> = { prueba: "Prueba", basico: "Básico", profesional: "Profesional", suspendido: "Suspendido" };
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
  const negocios = filtro ? todos.filter((n) => `${n.nombre} ${n.slug} ${n.duenos.map((d) => d.usuario ?? d.correo).join(" ")}`.toLowerCase().includes(filtro)) : todos;
  const activos = todos.filter((n) => n.plan !== "suspendido").length;
  const equipos = todos.reduce((t, n) => t + n.equipos_activos, 0);

  return (
    <>
      <Barra />
      <main className="contenido">
        <h1>Plataforma</h1>
        <p className="quieto">
          {nf.format(todos.length)} negocios · {nf.format(activos)} activos · {nf.format(equipos)} verificadores conectados hoy
        </p>
        <Aviso error={error} bien={bien} />
        {!hayClaveSecreta() && (
          <p className="aviso error">Falta <code>SUPABASE_SECRET_KEY</code> en Vercel: sin ella no se pueden crear las cuentas de los dueños.</p>
        )}

        <section className="tarjeta" aria-labelledby="t-alta">
          <h2 id="t-alta">Dar de alta un negocio</h2>
          <p className="quieto pequeno">Nace con su sucursal Principal y todas las funciones. El dueño entra en la web o en la app Prezio Administrador.</p>
          <form action={altaNegocio}>
            <div className="fila">
              <div className="campo" style={{ flex: "2 1 240px" }}>
                <label htmlFor="nombre">Nombre del negocio</label>
                <input id="nombre" name="nombre" required minLength={2} maxLength={80} placeholder="Ej.: Abarrotao Market" />
              </div>
              <div className="campo" style={{ flex: "1 1 200px" }}>
                <label htmlFor="slug">Código <small className="quieto">(opcional)</small></label>
                <input id="slug" name="slug" maxLength={40} pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" placeholder="abarrotao-market" autoComplete="off" />
              </div>
              <div className="campo" style={{ flex: "0 1 110px" }}>
                <label htmlFor="moneda">Moneda</label>
                <input id="moneda" name="moneda" defaultValue="RD$" maxLength={6} />
              </div>
              <div className="campo" style={{ flex: "0 1 160px" }}>
                <label htmlFor="plan">Plan</label>
                <select id="plan" name="plan" defaultValue="prueba">
                  <option value="prueba">Prueba</option><option value="basico">Básico</option><option value="profesional">Profesional</option>
                </select>
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
              <input name="q" defaultValue={q ?? ""} placeholder="Buscar negocio, código o dueño" aria-label="Buscar" />
              <button className="boton secundario" type="submit">Buscar</button>
            </form>
          </div>
          {negocios.length === 0 ? (
            <p className="quieto">{filtro ? "Ningún negocio coincide." : "Todavía no hay negocios: da de alta el primero arriba."}</p>
          ) : (
            <ul className="plat-lista">
              {negocios.map((n) => (
                <li key={n.id} className={`tarjeta plat-negocio${n.plan === "suspendido" ? " suspendido" : ""}`}>
                  <div className="plat-cabeza">
                    <div>
                      <h3>{n.nombre}</h3>
                      <p className="quieto pequeno"><code>{n.slug}</code> · desde {fecha(n.creado)}</p>
                    </div>
                    <span className={`chip plan-${n.plan}`}>{PLANES[n.plan] ?? n.plan}</span>
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
                    <form action={cambiarPlan} className="plat-plan">
                      <input type="hidden" name="negocio" value={n.id} />
                      <select name="plan" defaultValue={n.plan} aria-label={`Plan de ${n.nombre}`}>
                        {Object.entries(PLANES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <button className="boton secundario" type="submit">Guardar plan</button>
                    </form>
                    <details className="plat-dueno">
                      <summary>Agregar dueño</summary>
                      <form action={agregarDueno}>
                        <input type="hidden" name="negocio" value={n.id} />
                        <input type="hidden" name="slug" value={n.slug} />
                        <CamposDueno id={`d-${n.id}`} />
                        <button className="boton" type="submit">Agregar dueño</button>
                      </form>
                    </details>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
