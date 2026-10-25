import { Barra } from "@/components/Barra";
import { Aviso } from "@/components/Aviso";
import { SubNav } from "@/components/SubNav";
import { cargarNegocio } from "@/lib/negocio";
import { PERMISOS, resumenPermisos } from "@/lib/permisos";
import { problemaClaveSecreta } from "@/lib/supabase/admin";
import { Casillas } from "./Casillas";
import { SelectorNivel } from "./Nivel";
import type { Nivel } from "./tipos";
import { NOMBRE_PERMISO, type Permiso } from "@/lib/permisos";
import { borrarNivel, cambiarClave, crearUsuario, guardarNivel, guardarPermisos, quitarUsuario } from "./actions";

export const metadata = { title: "Usuarios" };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ bien?: string; error?: string }> };
type Miembro = { user_id: string; rol: string; usuario: string | null; permisos: string[] | null; sucursales: string[] | null; nivel_id: string | null };
type Perfil = { id: string; nombre: string | null; correo: string | null };

export default async function Usuarios({ params, searchParams }: Props) {
  const { slug } = await params;
  const { bien, error } = await searchParams;
  const { supabase, negocio, usuario: yo, puede, permisos: misPermisos, alcance: misSucursales, esDueno } =
    await cargarNegocio(slug, `/n/${slug}/usuarios`);
  const gestiona = puede("usuarios");
  const [{ data: m }, { data: p }, { data: s }, { data: nv }] = await Promise.all([
    supabase.from("miembros").select("user_id, rol, usuario, permisos, sucursales, nivel_id").eq("negocio_id", negocio.id),
    supabase.from("perfiles").select("id, nombre, correo"),
    supabase.from("sucursales").select("id, nombre, es_principal").eq("negocio_id", negocio.id).order("es_principal", { ascending: false }).order("nombre"),
    supabase.from("niveles").select("id, nombre, descripcion, permisos, por_sucursal, orden").eq("negocio_id", negocio.id).order("orden").order("nombre"),
  ]);
  const niveles = (nv ?? []) as Nivel[];
  const nombreNivel = (id: string | null) => niveles.find((n) => n.id === id)?.nombre ?? null;
  const miembros = ((m ?? []) as Miembro[]).sort((a, b) => (a.rol === "dueno" ? -1 : b.rol === "dueno" ? 1 : 0));
  const perfiles = new Map(((p ?? []) as Perfil[]).map((x) => [x.id, x]));
  const sucursales = (s ?? []) as { id: string; nombre: string }[];
  const nombreSuc = (id: string) => sucursales.find((x) => x.id === id)?.nombre ?? "—";
  // Lo que quien entra puede dar: el dueño todo; los demás, sus casillas sin «usuarios».
  const puedoDar = esDueno ? [...PERMISOS] : misPermisos.filter((x) => x !== "usuarios");
  const soloAlgunas = !esDueno && misSucursales !== null;
  // ¿Puede editar a cada persona? (no al dueño, no a sí mismo, no a quien tiene más que él)
  const editable = (x: Miembro) => gestiona && x.rol !== "dueno" && x.user_id !== yo.id && (esDueno || (
    (x.permisos ?? []).every((q) => puedoDar.includes(q as never))
    && (misSucursales === null || (x.sucursales !== null && x.sucursales.every((q) => misSucursales.includes(q))))));
  const problemaClave = gestiona ? problemaClaveSecreta() : null;
  const faltaClave = Boolean(problemaClave);
  // Editar niveles: el dueño, o quien tiene «Usuarios» en todo el negocio (solo los niveles con lo que él puede dar).
  const editaNivel = (n: Nivel) => gestiona && misSucursales === null && n.permisos.every((q) => puedoDar.includes(q as never));
  const nivelPorDefecto = niveles.find((n) => n.nombre === "Cajero" && editaNivel(n))?.id ?? null;
  const cuantos = (id: string) => miembros.filter((x) => x.nivel_id === id).length;

  return (
    <>
      <Barra negocio={{ nombre: negocio.nombre, slug: negocio.slug }} />
      <main className="contenido">
        <h1>{negocio.nombre}</h1>
        <SubNav slug={slug} activa="usuarios" />
        <Aviso error={error} bien={bien} />
        {faltaClave && (
          <p className="aviso error">Para crear usuarios sin correo falta un paso de instalación: {problemaClave} Las demás funciones de esta página sí sirven.</p>
        )}

        <section className="tarjeta" aria-labelledby="t-personas">
          <h2 id="t-personas">Personas con acceso</h2>
          <ul className="lista personas">
            {miembros.map((x) => {
              const perfil = perfiles.get(x.user_id);
              const sinCorreo = Boolean(x.usuario);
              return (
                <li key={x.user_id}>
                  <div className="persona-datos">
                    <p className="persona-nombre">
                      {perfil?.nombre || x.usuario || perfil?.correo}
                      {x.user_id === yo.id && <span className="quieto"> · tú</span>}
                    </p>
                    <p className="quieto pequeno" style={{ margin: 0 }}>
                      {sinCorreo ? <>Usuario <strong>{x.usuario}</strong></> : perfil?.correo}
                      {" · "}{x.rol !== "dueno" && <span className="chip nivel-chip">{nombreNivel(x.nivel_id) ?? "Personalizado"}</span>}{" "}
                      {resumenPermisos(x.rol, x.permisos, x.sucursales, nombreSuc)}
                    </p>
                  </div>
                  {editable(x) && (
                    <details className="persona-cambiar">
                      <summary className="boton secundario">Cambiar</summary>
                      <form action={guardarPermisos}>
                        <input type="hidden" name="slug" value={slug} /><input type="hidden" name="negocio" value={negocio.id} />
                        <input type="hidden" name="cuenta" value={x.user_id} />
                        <SelectorNivel id={x.user_id} niveles={niveles} actual={x.nivel_id} puedoDar={puedoDar}>
                          <Casillas id={x.user_id} marcados={x.permisos ?? []} alcance={x.sucursales} sucursales={sucursales}
                            puedoDar={puedoDar} soloAlgunas={soloAlgunas} misSucursales={misSucursales} />
                        </SelectorNivel>
                        <button className="boton" type="submit">Guardar acceso</button>
                      </form>
                      {sinCorreo && (
                        <form action={cambiarClave} className="fila" style={{ marginTop: 16 }}>
                          <input type="hidden" name="slug" value={slug} /><input type="hidden" name="negocio" value={negocio.id} />
                          <input type="hidden" name="cuenta" value={x.user_id} />
                          <div className="campo" style={{ marginBottom: 0 }}>
                            <label htmlFor={`clave-${x.user_id}`}>Clave nueva</label>
                            <input id={`clave-${x.user_id}`} name="clave" type="password" minLength={8} autoComplete="new-password" required />
                          </div>
                          <button className="boton secundario" type="submit">Cambiar clave</button>
                        </form>
                      )}
                      <form action={quitarUsuario} style={{ marginTop: 16 }}>
                        <input type="hidden" name="slug" value={slug} /><input type="hidden" name="negocio" value={negocio.id} />
                        <input type="hidden" name="cuenta" value={x.user_id} />
                        <button className="boton secundario peligro" type="submit">
                          {sinCorreo ? "Quitar y borrar este usuario" : "Quitar del negocio"}
                        </button>
                      </form>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {gestiona ? (
          <section className="tarjeta" aria-labelledby="t-nuevo" style={{ marginTop: 20 }}>
            <h2 id="t-nuevo">Nuevo usuario</h2>
            <p className="quieto" style={{ marginTop: 0 }}>
              Para empleados, sin correo. Entran en Prezio › Entrar › <strong>Con usuario</strong> con la licencia del negocio
              <strong> {negocio.licencia}</strong>, su usuario y su clave. Si olvidan la clave, la cambias aquí.
            </p>
            <form action={crearUsuario}>
              <input type="hidden" name="slug" value={slug} /><input type="hidden" name="negocio" value={negocio.id} />
              <div className="fila">
                <div className="campo">
                  <label htmlFor="n-usuario">Usuario</label>
                  <input id="n-usuario" name="usuario" required pattern="[a-z0-9][a-z0-9._\-]{2,29}" maxLength={30}
                    autoCapitalize="none" spellCheck={false} placeholder="ej.: juan" />
                </div>
                <div className="campo">
                  <label htmlFor="n-nombre">Nombre</label>
                  <input id="n-nombre" name="nombre" maxLength={80} placeholder="Juan Pérez" />
                </div>
                <div className="campo">
                  <label htmlFor="n-clave">Clave</label>
                  <input id="n-clave" name="clave" type="password" minLength={8} required autoComplete="new-password" />
                </div>
              </div>
              <SelectorNivel id="nuevo" niveles={niveles} actual={nivelPorDefecto} puedoDar={puedoDar}>
                <Casillas id="nuevo" marcados={[]} alcance={null} sucursales={sucursales}
                  puedoDar={puedoDar} soloAlgunas={soloAlgunas} misSucursales={misSucursales} />
              </SelectorNivel>
              <button className="boton" type="submit" disabled={faltaClave}>Crear usuario</button>
            </form>
          </section>
        ) : (
          <p className="quieto" style={{ marginTop: 20 }}>Los usuarios los crea el dueño o quien tenga la casilla «Usuarios».</p>
        )}
        <section className="tarjeta" aria-labelledby="t-niveles" style={{ marginTop: 20 }}>
          <h2 id="t-niveles">Niveles de acceso</h2>
          <p className="quieto" style={{ marginTop: 0 }}>
            Plantillas de permisos para no marcar casillas una por una. Cambiar un nivel cambia a todas las personas que lo tienen.
          </p>
          <ul className="niveles">
            {niveles.map((n) => (
              <li key={n.id} className="nivel">
                <div className="nivel-cabeza">
                  <div>
                    <h3>{n.nombre}</h3>
                    {n.descripcion && <p className="quieto pequeno">{n.descripcion}</p>}
                  </div>
                  <span className="quieto pequeno">{cuantos(n.id)} {cuantos(n.id) === 1 ? "persona" : "personas"}</span>
                </div>
                <p className="nivel-casillas">
                  {n.permisos.length ? n.permisos.map((q) => <span key={q} className="chip">{NOMBRE_PERMISO[q as Permiso]?.nombre ?? q}</span>)
                    : <span className="chip">Solo el verificador</span>}
                  {n.por_sucursal && <span className="chip nivel-suc">Por sucursal</span>}
                </p>
                {editaNivel(n) && (
                  <details className="nivel-editar">
                    <summary>Cambiar</summary>
                    <FormNivel slug={slug} negocio={negocio.id} nivel={n} puedoDar={puedoDar} />
                    <form action={borrarNivel}>
                      <input type="hidden" name="slug" value={slug} /><input type="hidden" name="nivel" value={n.id} />
                      <button className="boton secundario peligro" type="submit">Borrar este nivel</button>
                    </form>
                  </details>
                )}
              </li>
            ))}
          </ul>
          {gestiona && misSucursales === null && (
            <details className="nivel-editar" style={{ marginTop: 14 }}>
              <summary className="boton secundario">Crear un nivel</summary>
              <FormNivel slug={slug} negocio={negocio.id} nivel={null} puedoDar={puedoDar} />
            </details>
          )}
        </section>
      </main>
    </>
  );
}

/** Formulario de un nivel (crear o cambiar). */
function FormNivel({ slug, negocio, nivel, puedoDar }: { slug: string; negocio: string; nivel: Nivel | null; puedoDar: string[] }) {
  const id = nivel?.id ?? "nuevo-nivel";
  return (
    <form action={guardarNivel} className="nivel-form">
      <input type="hidden" name="slug" value={slug} /><input type="hidden" name="negocio" value={negocio} />
      {nivel && <input type="hidden" name="nivel" value={nivel.id} />}
      <div className="fila">
        <div className="campo"><label htmlFor={`nn-${id}`}>Nombre</label>
          <input id={`nn-${id}`} name="nombre" required minLength={2} maxLength={40} defaultValue={nivel?.nombre ?? ""} placeholder="Ej.: Auditor" /></div>
        <div className="campo" style={{ flex: "2 1 280px" }}><label htmlFor={`nd-${id}`}>Para qué es <small className="quieto">(opcional)</small></label>
          <input id={`nd-${id}`} name="descripcion" maxLength={140} defaultValue={nivel?.descripcion ?? ""} placeholder="Ej.: Revisa precios y reportes" /></div>
      </div>
      <fieldset className="casillas">
        <legend>Puede</legend>
        {PERMISOS.map((q) => (
          <label key={q} className={`casilla${puedoDar.includes(q) ? "" : " bloqueada"}`}>
            <input type="checkbox" name="permiso" value={q} defaultChecked={nivel?.permisos.includes(q) ?? false} disabled={!puedoDar.includes(q)} />
            <span><strong>{NOMBRE_PERMISO[q].nombre}</strong><span className="quieto pequeno">{NOMBRE_PERMISO[q].detalle}</span></span>
          </label>
        ))}
      </fieldset>
      <label className="casilla-linea"><input type="checkbox" name="por_sucursal" value="si" defaultChecked={nivel?.por_sucursal ?? false} />
        Por sucursal: al darlo se eligen las sucursales</label>
      <button className="boton" type="submit" style={{ marginTop: 10 }}>{nivel ? "Guardar nivel" : "Crear nivel"}</button>
    </form>
  );
}
