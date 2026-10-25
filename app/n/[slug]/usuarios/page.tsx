import { Barra } from "@/components/Barra";
import { Aviso } from "@/components/Aviso";
import { SubNav } from "@/components/SubNav";
import { cargarNegocio } from "@/lib/negocio";
import { PERMISOS, resumenPermisos } from "@/lib/permisos";
import { hayClaveSecreta } from "@/lib/supabase/admin";
import { Casillas } from "./Casillas";
import { cambiarClave, crearUsuario, guardarPermisos, quitarUsuario } from "./actions";

export const metadata = { title: "Usuarios" };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ bien?: string; error?: string }> };
type Miembro = { user_id: string; rol: string; usuario: string | null; permisos: string[] | null; sucursales: string[] | null };
type Perfil = { id: string; nombre: string | null; correo: string | null };

export default async function Usuarios({ params, searchParams }: Props) {
  const { slug } = await params;
  const { bien, error } = await searchParams;
  const { supabase, negocio, usuario: yo, puede, permisos: misPermisos, alcance: misSucursales, esDueno } =
    await cargarNegocio(slug, `/n/${slug}/usuarios`);
  const gestiona = puede("usuarios");
  const [{ data: m }, { data: p }, { data: s }] = await Promise.all([
    supabase.from("miembros").select("user_id, rol, usuario, permisos, sucursales").eq("negocio_id", negocio.id),
    supabase.from("perfiles").select("id, nombre, correo"),
    supabase.from("sucursales").select("id, nombre, es_principal").eq("negocio_id", negocio.id).order("es_principal", { ascending: false }).order("nombre"),
  ]);
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
  const faltaClave = gestiona && !hayClaveSecreta();

  return (
    <>
      <Barra negocio={{ nombre: negocio.nombre, slug: negocio.slug }} />
      <main className="contenido">
        <h1>{negocio.nombre}</h1>
        <SubNav slug={slug} activa="usuarios" />
        <Aviso error={error} bien={bien} />
        {faltaClave && (
          <p className="aviso error">Para crear usuarios sin correo falta un paso de instalación: la clave secreta de Supabase en Vercel
            (<code>SUPABASE_SECRET_KEY</code>). Las demás funciones de esta página sí sirven.</p>
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
                      {" · "}{resumenPermisos(x.rol, x.permisos, x.sucursales, nombreSuc)}
                    </p>
                  </div>
                  {editable(x) && (
                    <details className="persona-cambiar">
                      <summary className="boton secundario">Cambiar</summary>
                      <form action={guardarPermisos}>
                        <input type="hidden" name="slug" value={slug} /><input type="hidden" name="negocio" value={negocio.id} />
                        <input type="hidden" name="cuenta" value={x.user_id} />
                        <Casillas id={x.user_id} marcados={x.permisos ?? []} alcance={x.sucursales} sucursales={sucursales}
                          puedoDar={puedoDar} soloAlgunas={soloAlgunas} misSucursales={misSucursales} />
                        <button className="boton" type="submit">Guardar permisos</button>
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
              <Casillas id="nuevo" marcados={[]} alcance={null} sucursales={sucursales}
                puedoDar={puedoDar} soloAlgunas={soloAlgunas} misSucursales={misSucursales} />
              <button className="boton" type="submit" disabled={faltaClave}>Crear usuario</button>
            </form>
          </section>
        ) : (
          <p className="quieto" style={{ marginTop: 20 }}>Los usuarios los crea el dueño o quien tenga la casilla «Usuarios».</p>
        )}
      </main>
    </>
  );
}
