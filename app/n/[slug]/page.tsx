import { notFound, redirect } from "next/navigation";
import { Barra } from "@/components/Barra";
import { Aviso } from "@/components/Aviso";
import { supabaseServidor } from "@/lib/supabase/server";
import { ROLES, sitio } from "@/lib/util";
import { PERMISOS, resumenPermisos } from "@/lib/permisos";
import { SubNav } from "@/components/SubNav";
import { CodigoNegocio } from "@/components/CodigoNegocio";
import { Reporte, type Resumen } from "./Reporte";
import { invitar, quitarMiembro } from "./actions";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ bien?: string; error?: string; invitado?: string; dias?: string }>;
};

type Negocio = { id: string; nombre: string; slug: string; plan: string; prueba_hasta: string; moneda: string };
type Sucursal = { id: string; nombre: string; codigo: string; es_principal: boolean; activa: boolean; fuente: { tipo?: string; inventario_id?: string };
  geo_activa: boolean; latitud: number | null; longitud: number | null; radio_m: number };
type Miembro = { user_id: string; rol: string; sucursal_id: string | null; permisos: string[] | null; sucursales: string[] | null; usuario: string | null };
type Perfil = { id: string; nombre: string; correo: string };
type Invitacion = { id: string; correo: string; rol: string; token: string; expira: string; aceptada: string | null };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return { title: slug };
}

export default async function PanelNegocio({ params, searchParams }: Props) {
  const { slug } = await params;
  const { bien, error, invitado, dias: diasTexto } = await searchParams;
  const diasReporte = [7, 30, 90].includes(Number(diasTexto)) ? Number(diasTexto) : 7;
  const supabase = await supabaseServidor();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/entrar?siguiente=/n/${slug}`);

  // La RLS solo devuelve el negocio si el usuario es miembro: si no, es como si no existiera.
  const { data: fila } = await supabase
    .from("negocios")
    .select("id, nombre, slug, plan, prueba_hasta, moneda")
    .eq("slug", slug)
    .maybeSingle();
  const negocio = fila as Negocio | null;
  if (!negocio) notFound();

  const [{ data: sucursales }, { data: miembros }, { data: perfiles }, { data: invitaciones }, { data: inventarios }] = await Promise.all([
    supabase.from("sucursales").select("id, nombre, codigo, es_principal, activa, fuente, geo_activa, latitud, longitud, radio_m").eq("negocio_id", negocio.id)
      .order("es_principal", { ascending: false }).order("nombre"),
    supabase.from("miembros").select("user_id, rol, sucursal_id, permisos, sucursales, usuario").eq("negocio_id", negocio.id),
    supabase.from("perfiles").select("id, nombre, correo"),
    supabase.from("invitaciones").select("id, correo, rol, token, expira, aceptada").eq("negocio_id", negocio.id)
      .is("aceptada", null).gt("expira", new Date().toISOString()).order("creada", { ascending: false }),
    supabase.from("inventarios").select("id, nombre").eq("negocio_id", negocio.id).order("nombre"),
  ]);
  const losInventarios = (inventarios ?? []) as { id: string; nombre: string }[];
  const lasSucursales = (sucursales ?? []) as Sucursal[];
  const losMiembros = (miembros ?? []) as Miembro[];
  const quien = new Map(((perfiles ?? []) as Perfil[]).map((p) => [p.id, p]));
  const pendientes = (invitaciones ?? []) as Invitacion[];
  const yoM = losMiembros.find((m) => m.user_id === auth.user!.id);
  const miRol = yoM?.rol ?? "verificador";
  const esDueno = miRol === "dueno";
  const misPermisos = esDueno ? [...PERMISOS] as string[] : (yoM?.permisos ?? []);
  const miAlcance = esDueno ? null : (yoM?.sucursales ?? null);      // null = todas las sucursales
  // Mismas reglas que la base (public.puede): sin sucursal = en todas; con sucursal = en esa.
  const puede = (permiso: string, sucursal?: string) =>
    esDueno || (misPermisos.includes(permiso) && (miAlcance === null || (Boolean(sucursal) && miAlcance.includes(sucursal!))));
  const administra = puede("sucursales");            // crear sucursales (en todas)
  const puedeVerReporte = esDueno || (misPermisos.includes("reportes") && (miAlcance === null || miAlcance.length > 0));
  const { data: resumen } = puedeVerReporte
    ? await supabase.rpc("resumen_consultas", { p_negocio: negocio.id, p_dias: diasReporte })
    : { data: null };
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
        <p className="quieto">Tus permisos: {resumenPermisos(miRol, misPermisos, miAlcance, nombreSucursal)}</p>
        <CodigoNegocio codigo={negocio.slug} />
        <SubNav slug={negocio.slug} activa="resumen" />

        {losInventarios.length === 0 && puede("inventarios") && (
          <p className="aviso bien">
            Siguiente paso: carga tus precios en <a href={`/n/${negocio.slug}/inventarios`}>Inventarios</a> y elige en{" "}
            <a href={`/n/${negocio.slug}/sucursales`}>Sucursales</a> de qué inventario toma los precios cada una. ¿Vienes del sistema anterior? <a href={`/n/${negocio.slug}/importar`}>Importa
            su respaldo</a> y se crea todo de una vez.
          </p>
        )}
        {resumen && <Reporte r={resumen as Resumen} slug={negocio.slug} dias={diasReporte} />}
        <section id="equipo" className="tarjeta">
          <h2>Equipo</h2>
          <ul className="lista">
            {losMiembros.map((m) => {
              const p = quien.get(m.user_id);
              const puedeQuitar = puede("usuarios") && m.rol !== "dueno" && m.user_id !== auth.user!.id
                && (esDueno || m.rol !== "admin");
              return (
                <li key={m.user_id}>
                  <span>
                    <strong>{p?.nombre || m.usuario || p?.correo || "Usuario"}</strong>
                    <span className="quieto pequeno"> {m.usuario ? `usuario ${m.usuario}` : p?.nombre ? p.correo : ""}</span>
                    <br />
                    <span className="pequeno quieto">
                      {resumenPermisos(m.rol, m.permisos, m.sucursales, nombreSucursal)}
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

          <p className="pequeno" style={{ marginTop: 12 }}>
            <a href={`/n/${negocio.slug}/usuarios`}>Usuarios y permisos</a>: crea usuarios sin correo para tus empleados y elige qué puede hacer cada uno.
          </p>
          {puede("usuarios") && (
            <>
              {invitado && (
                <div className="aviso bien" style={{ marginTop: 16 }}>
                  <p style={{ marginBottom: 8 }}>
                    Invitación creada. Envíale este enlace por WhatsApp o correo; vence en 7 días:
                  </p>
                  <div className="copiar">{`${sitio()}/invitacion/${invitado}`}</div>
                </div>
              )}
              <h2 style={{ marginTop: 24 }}>Invitar por correo</h2>
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
                      {esDueno && <option value="admin">Administrador: todo menos la suscripción</option>}
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

      </main>
    </>
  );
}
