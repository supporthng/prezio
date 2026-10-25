import Link from "next/link";
import { Barra } from "@/components/Barra";
import { Aviso } from "@/components/Aviso";
import { SubNav } from "@/components/SubNav";
import { cargarNegocio } from "@/lib/negocio";
import { sitio } from "@/lib/util";
import { cambiarEquipo, quitarEquipo, vincularEquipo } from "./actions";
import { ClaveSalida } from "./ClaveSalida";
import apps from "@/public/apps.json";

type App = { version: string; url: string; fecha: string };

export const metadata = { title: "Equipos" };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ bien?: string; error?: string }> };
type Equipo = {
  id: string; nombre: string; sucursal_id: string; creado: string; visto: string | null; app: string | null;
  productos: number | null; pendientes: number | null; version_precios: string | null;
};
type Sucursal = { id: string; nombre: string; es_principal: boolean };

/** «hace 3 min», «hace 2 h», «hace 4 días». */
function hace(iso: string | null): string {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} días`;
}

export default async function Equipos({ params, searchParams }: Props) {
  const { slug } = await params;
  const { bien, error } = await searchParams;
  const { supabase, negocio, puede: tiene } = await cargarNegocio(slug, `/n/${slug}/equipos`);
  const administra = tiene("equipos");   // en todas las sucursales (también la clave de salida)
  const [{ data: eq }, { data: suc }] = await Promise.all([
    supabase.from("equipos").select("id, nombre, sucursal_id, creado, visto, app, productos, pendientes, version_precios")
      .eq("negocio_id", negocio.id).order("creado"),
    supabase.from("sucursales").select("id, nombre, es_principal").eq("negocio_id", negocio.id)
      .order("es_principal", { ascending: false }).order("nombre"),
  ]);
  const equipos = (eq ?? []) as Equipo[];
  const todas = (suc ?? []) as Sucursal[];
  // El encargado trabaja solo con su sucursal.
  const sucursales = todas.filter((s) => tiene("equipos", s.id));
  const puede = sucursales.length > 0;
  const nombreSuc = (id: string) => todas.find((s) => s.id === id)?.nombre ?? "—";
  // Versión de precios actual de cada sucursal, para saber si un equipo está al día.
  const versiones = new Map<string, string>();
  await Promise.all(sucursales.map(async (s) => {
    const { data } = await supabase.rpc("version_precios_panel", { p_sucursal: s.id });
    if (typeof data === "string") versiones.set(s.id, data);
  }));
  const direccion = `${sitio() || ""}/equipo`;
  const { data: sal } = administra
    ? await supabase.from("negocio_salida").select("cambiada").eq("negocio_id", negocio.id).maybeSingle()
    : { data: null };
  const salidaPuesta = (sal as { cambiada: string } | null)?.cambiada ?? null;
  const descargas: { clave: string; nombre: string; detalle: string; app: App }[] = [
    { clave: "android", nombre: "Android", detalle: "Tabletas y teléfonos Android 5 o más nuevo (APK).", app: apps.android },
    { clave: "windows", nombre: "Windows", detalle: "PC o pantalla con Windows 10 u 11 (instalador).", app: apps.windows },
    { clave: "administrador", nombre: "Prezio Administrador (Windows)", detalle: "Para la oficina: el panel del negocio y la conexión con la base de datos del sistema (busca el servidor en la red).",
      app: (apps as { administrador?: App }).administrador ?? { version: "", url: "", fecha: "" } },
  ];

  return (
    <>
      <Barra negocio={{ nombre: negocio.nombre, slug: negocio.slug }} />
      <main className="contenido">
        <h1>{negocio.nombre}</h1>
        <SubNav slug={slug} activa="equipos" />
        <Aviso error={error} bien={bien} />

        {!puede ? (
          <section className="tarjeta"><p style={{ margin: 0 }}>Los equipos requieren la casilla «Equipos» (Usuarios).</p></section>
        ) : (
          <>
            <section className="tarjeta" aria-labelledby="t-vincular">
              <h2 id="t-vincular">Vincular un equipo</h2>
              <p className="quieto" style={{ marginTop: 0 }}>
                En la tableta, el teléfono o la PC del verificador abre <strong>{direccion.replace(/^https?:\/\//, "")}</strong>.
                Ahí mismo puedes tocar <strong>Elegir sucursal</strong> y entrar con tu usuario, o escribir aquí el código
                de 8 cifras que muestra. Desde ese momento guarda los precios de su sucursal y sigue funcionando aunque
                se vaya el internet.
              </p>
              <form action={vincularEquipo} className="fila">
                <input type="hidden" name="slug" value={slug} />
                <div className="campo" style={{ marginBottom: 0 }}>
                  <label htmlFor="codigo">Código del equipo</label>
                  <input id="codigo" name="codigo" inputMode="numeric" autoComplete="off" required placeholder="1234 5678"
                    pattern="[0-9\s\-]{8,10}" maxLength={10} className="entrada-codigo" />
                </div>
                <div className="campo" style={{ marginBottom: 0 }}>
                  <label htmlFor="sucursal">Sucursal</label>
                  <select id="sucursal" name="sucursal" required>
                    {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
                <div className="campo" style={{ marginBottom: 0 }}>
                  <label htmlFor="nombre">Nombre <span className="quieto">(opcional)</span></label>
                  <input id="nombre" name="nombre" maxLength={60} placeholder="Ej.: Pasillo 3" />
                </div>
                <button className="boton" type="submit">Vincular</button>
              </form>
            </section>

            <section className="tarjeta" aria-labelledby="t-equipos" style={{ marginTop: 20 }}>
              <h2 id="t-equipos">Equipos vinculados</h2>
              {equipos.length === 0 ? (
                <p className="quieto" style={{ marginBottom: 0 }}>Todavía no hay equipos. Vincula el primero arriba.</p>
              ) : (
                <ul className="lista equipos">
                  {equipos.map((e) => {
                    const enLinea = e.visto && Date.now() - Date.parse(e.visto) < 12 * 60000;
                    const alDia = e.version_precios && versiones.get(e.sucursal_id) === e.version_precios;
                    return (
                      <li key={e.id}>
                        <div className="equipo-datos">
                          <p className="equipo-nombre">
                            <span className={`punto ${enLinea ? "verde" : "gris"}`} aria-hidden="true" />
                            {e.nombre} <span className="quieto">· {nombreSuc(e.sucursal_id)}</span>
                          </p>
                          <p className="quieto pequeno" style={{ margin: 0 }}>
                            {enLinea ? "Conectado" : `Última conexión ${hace(e.visto)}`}
                            {e.productos != null && ` · ${e.productos.toLocaleString("es-DO")} precios`}
                            {e.visto && (alDia ? " · al día" : " · esperando precios nuevos")}
                            {e.pendientes ? ` · ${e.pendientes.toLocaleString("es-DO")} consultas por subir` : ""}
                            {e.app && ` · ${e.app}`}
                          </p>
                        </div>
                        <details className="equipo-cambiar">
                          <summary className="boton secundario">Cambiar</summary>
                          <form action={cambiarEquipo} className="fila">
                            <input type="hidden" name="slug" value={slug} />
                            <input type="hidden" name="equipo" value={e.id} />
                            <div className="campo" style={{ marginBottom: 0 }}>
                              <label htmlFor={`n-${e.id}`}>Nombre</label>
                              <input id={`n-${e.id}`} name="nombre" defaultValue={e.nombre} maxLength={60} required />
                            </div>
                            <div className="campo" style={{ marginBottom: 0 }}>
                              <label htmlFor={`s-${e.id}`}>Sucursal</label>
                              <select id={`s-${e.id}`} name="sucursal" defaultValue={e.sucursal_id}>
                                {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                              </select>
                            </div>
                            <button className="boton" type="submit">Guardar</button>
                          </form>
                          <form action={quitarEquipo} style={{ marginTop: 12 }}>
                            <input type="hidden" name="slug" value={slug} />
                            <input type="hidden" name="equipo" value={e.id} />
                            <button className="boton secundario peligro" type="submit">Desvincular este equipo</button>
                          </form>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section className="tarjeta" aria-labelledby="t-apps" style={{ marginTop: 20 }}>
              <h2 id="t-apps">Apps Prezio</h2>
              <p className="quieto" style={{ marginTop: 0 }}>
                Abren el verificador a pantalla completa, arrancan solas al encender el equipo, no dejan salir sin la
                clave y se actualizan solas. Sin la app también funciona desde el navegador.
              </p>
              <ul className="lista">
                {descargas.map((d) => (
                  <li key={d.clave}>
                    <img src={d.clave === "administrador" ? "/iconos/prezio-administrador.svg" : "/iconos/prezio-192.png"} alt="" width={44} height={44}
                      style={{ borderRadius: 10, flex: "none" }} />
                    <div style={{ flex: "1 1 240px" }}>
                      <p style={{ margin: "0 0 2px", fontWeight: 650 }}>{d.nombre}{d.app.version && <span className="quieto"> · versión {d.app.version}</span>}</p>
                      <p className="quieto pequeno" style={{ margin: 0 }}>{d.detalle}{d.app.fecha && ` Publicada ${new Date(d.app.fecha).toLocaleDateString("es-DO")}.`}</p>
                    </div>
                    {d.app.url
                      ? <a className="boton" href={d.app.url}>Descargar</a>
                      : <span className="quieto pequeno">Todavía no se ha publicado</span>}
                  </li>
                ))}
              </ul>
            </section>
            {administra && <ClaveSalida negocioId={negocio.id} puesta={salidaPuesta} />}
            <p className="quieto pequeno">
              ¿Prefieres probar sin vincular? El <Link href={`/v/${slug}`}>verificador en línea</Link> funciona con tu cuenta,
              pero necesita internet en cada consulta.
            </p>
          </>
        )}
      </main>
    </>
  );
}
