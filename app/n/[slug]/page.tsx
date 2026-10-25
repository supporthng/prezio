import { notFound, redirect } from "next/navigation";
import { Barra } from "@/components/Barra";
import { Aviso } from "@/components/Aviso";
import { supabaseServidor } from "@/lib/supabase/server";
import { ROLES, sitio } from "@/lib/util";
import { crearSucursal, invitar, quitarMiembro, renombrarSucursal } from "./actions";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ bien?: string; error?: string; invitado?: string }>;
};

type Sucursal = { id: string; nombre: string; codigo: string; es_principal: boolean; activa: boolean };
type Miembro = { user_id: string; rol: string; sucursal_id: string | null };
type Perfil = { id: string; nombre: string; correo: string };
type Invitacion = { id: string; correo: string; rol: string; token: string; expira: string; aceptada: string | null };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return { title: slug };
}

export default async function PanelNegocio({ params, searchParams }: Props) {
  const { slug } = await params;
  const { bien, error, invitado } = await searchParams;
  const supabase = await supabaseServidor();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/entrar?siguiente=/n/${slug}`);

  // La RLS solo devuelve el negocio si el usuario es miembro: si no, es como si no existiera.
  const { data: negocio } = await supabase
    .from("negocios")
    .select("id, nombre, slug, plan, prueba_hasta, moneda")
    .eq("slug", slug)
    .maybeSingle();
  if (!negocio) notFound();

  const [{ data: sucursales }, { data: miembros }, { data: perfiles }, { data: invitaciones }] = await Promise.all([
    supabase.from("sucursales").select("id, nombre, codigo, es_principal, activa").eq("negocio_id", negocio.id)
      .order("es_principal", { ascending: false }).order("nombre"),
    supabase.from("miembros").select("user_id, rol, sucursal_id").eq("negocio_id", negocio.id),
    supabase.from("perfiles").select("id, nombre, correo"),
    supabase.from("invitaciones").select("id, correo, rol, token, expira, aceptada").eq("negocio_id", negocio.id)
      .is("aceptada", null).gt("expira", new Date().toISOString()).order("creada", { ascending: false }),
  ]);
  const lasSucursales = (sucursales ?? []) as Sucursal[];
  const losMiembros = (miembros ?? []) as Miembro[];
  const quien = new Map(((perfiles ?? []) as Perfil[]).map((p) => [p.id, p]));
  const pendientes = (invitaciones ?? []) as Invitacion[];
  const miRol = losMiembros.find((m) => m.user_id === auth.user!.id)?.rol ?? "verificador";
  const administra = miRol === "dueno" || miRol === "admin";
  const dias = Math.max(0, Math.ceil((Date.parse(negocio.prueba_hasta) - Date.now()) / 864e5));
  const nombreSucursal = (id: string | null) => lasSucursales.find((s) => s.id === id)?.nombre ?? "";

  return (
    <>
      <Barra negocio={{ nombre: negocio.nombre, slug: negocio.slug }} />
      <main className="contenido">
        <Aviso error={error} bien={bien} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1>{negocio.nombre}</h1>
          {negocio.plan === "prueba" ? (
            <span className="chip etiqueta">Prueba gratis · {dias} {dias === 1 ? "día" : "días"}</span>
          ) : (
            <span className="chip">Plan {negocio.plan}</span>
          )}
        </div>
        <p className="quieto">Tu rol: {ROLES[miRol] ?? miRol}</p>

        <section id="sucursales" className="tarjeta" style={{ marginTop: 24 }}>
          <h2>Sucursales</h2>
          <ul className="lista">
            {lasSucursales.map((s) => (
              <li key={s.id}>
                {administra ? (
                  <form action={renombrarSucursal} className="fila" style={{ flex: 1 }}>
                    <input type="hidden" name="slug" value={negocio.slug} />
                    <input type="hidden" name="sucursal" value={s.id} />
                    <div className="campo" style={{ marginBottom: 0 }}>
                      <label className="pequeno quieto" htmlFor={`n-${s.id}`}>
                        {s.es_principal ? "Principal" : "Sucursal"}
                      </label>
                      <input id={`n-${s.id}`} name="nombre" defaultValue={s.nombre} maxLength={80} required />
                    </div>
                    <button className="boton secundario" type="submit">Guardar</button>
                  </form>
                ) : (
                  <span>{s.nombre}</span>
                )}
              </li>
            ))}
          </ul>
          {administra && (
            <form action={crearSucursal} className="fila" style={{ marginTop: 16 }}>
              <input type="hidden" name="slug" value={negocio.slug} />
              <input type="hidden" name="negocio" value={negocio.id} />
              <div className="campo" style={{ marginBottom: 0 }}>
                <label htmlFor="nueva-suc">Nueva sucursal</label>
                <input id="nueva-suc" name="nombre" maxLength={80} placeholder="Ej.: Sucursal Centro" required />
              </div>
              <button className="boton" type="submit">Agregar</button>
            </form>
          )}
        </section>

        <section id="equipo" className="tarjeta" style={{ marginTop: 24 }}>
          <h2>Equipo</h2>
          <ul className="lista">
            {losMiembros.map((m) => {
              const p = quien.get(m.user_id);
              const puedeQuitar = administra && m.rol !== "dueno" && m.user_id !== auth.user!.id
                && (miRol === "dueno" || m.rol !== "admin");
              return (
                <li key={m.user_id}>
                  <span>
                    <strong>{p?.nombre || p?.correo || "Usuario"}</strong>
                    <span className="quieto pequeno"> {p?.nombre ? p.correo : ""}</span>
                    <br />
                    <span className="pequeno quieto">
                      {ROLES[m.rol] ?? m.rol}{m.rol === "encargado" ? ` · ${nombreSucursal(m.sucursal_id)}` : ""}
                    </span>
                  </span>
                  {puedeQuitar && (
                    <form action={quitarMiembro}>
                      <input type="hidden" name="slug" value={negocio.slug} />
                      <input type="hidden" name="negocio" value={negocio.id} />
                      <input type="hidden" name="usuario" value={m.user_id} />
                      <button className="boton secundario" type="submit">Quitar</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>

          {administra && (
            <>
              {invitado && (
                <div className="aviso bien" style={{ marginTop: 16 }}>
                  <p style={{ marginBottom: 8 }}>
                    Invitación creada. Envíale este enlace por WhatsApp o correo; vence en 7 días:
                  </p>
                  <div className="copiar">{`${sitio()}/invitacion/${invitado}`}</div>
                </div>
              )}
              <h2 style={{ marginTop: 24 }}>Invitar a alguien</h2>
              <form action={invitar}>
                <input type="hidden" name="slug" value={negocio.slug} />
                <input type="hidden" name="negocio" value={negocio.id} />
                <div className="fila">
                  <div className="campo">
                    <label htmlFor="correo">Correo</label>
                    <input id="correo" name="correo" type="email" required />
                  </div>
                  <div className="campo">
                    <label htmlFor="rol">Rol</label>
                    <select id="rol" name="rol" defaultValue="encargado">
                      {miRol === "dueno" && <option value="admin">Administrador: todo menos la suscripción</option>}
                      <option value="encargado">Encargado: solo su sucursal</option>
                      <option value="verificador">Verificador: solo consultar precios</option>
                    </select>
                  </div>
                  <div className="campo">
                    <label htmlFor="sucursal">Sucursal (para encargados)</label>
                    <select id="sucursal" name="sucursal">
                      {lasSucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                  </div>
                </div>
                <button className="boton" type="submit">Crear invitación</button>
              </form>
              {pendientes.length > 0 && (
                <>
                  <h2 style={{ marginTop: 24 }}>Invitaciones pendientes</h2>
                  <ul className="lista">
                    {pendientes.map((i) => (
                      <li key={i.id}>
                        <span>
                          {i.correo} <span className="quieto pequeno">· {ROLES[i.rol] ?? i.rol}</span>
                          <br />
                          <span className="copiar" style={{ display: "inline-block", marginTop: 6 }}>
                            {`${sitio()}/invitacion/${i.token}`}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </section>

        <section className="tarjeta" style={{ marginTop: 24 }}>
          <h2>Próximamente en tu panel</h2>
          <p className="quieto" style={{ marginBottom: 0 }}>
            Inventarios desde Excel, fuente de precios por sucursal, apariencia de la pantalla y el verificador en línea.
          </p>
        </section>
      </main>
    </>
  );
}
