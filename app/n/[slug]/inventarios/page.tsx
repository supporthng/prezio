import { Barra } from "@/components/Barra";
import { Aviso } from "@/components/Aviso";
import { SubNav } from "@/components/SubNav";
import { cargarNegocio } from "@/lib/negocio";
import { CargaInventario } from "./CargaInventario";
import { eliminarInventario, renombrarInventario } from "./actions";
import { actualizarGoogle, ajustarGoogle } from "./fuentes";
import { FuenteGoogle } from "./FuenteGoogle";
import { Conectores, type ConectorFila } from "./Conectores";
import { FRECUENCIAS, type OrigenGoogle } from "@/lib/fuentes";
import { sitio } from "@/lib/util";

import apps from "@/public/apps.json";

// El conector viene dentro de Prezio Administrador (Releases › «administrador»); si todavía no se ha publicado,
// queda el conector de consola (Releases › «conector»).
const DESCARGA_CONECTOR = (apps as { administrador?: { url?: string } }).administrador?.url
  || "https://github.com/supporthng/prezio/releases/download/conector/PrezioConector.exe";

export const metadata = { title: "Inventarios" };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ bien?: string; error?: string }> };
type Estado = { ultimo?: string; productos?: number; error?: string | null; error_hora?: string };
type Origen = { tipo?: "google" | "conector"; conector_id?: string } & Partial<Omit<OrigenGoogle, "tipo">>;
type Inventario = { id: string; nombre: string; actualizado: string; origen: Origen; estado: Estado };

function hace(iso?: string | null): string {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} días`;
}
type Sucursal = { id: string; nombre: string; es_principal: boolean; fuente: { tipo?: string; inventario_id?: string } };

export default async function Inventarios({ params, searchParams }: Props) {
  const { slug } = await params;
  const { bien, error } = await searchParams;
  const { supabase, negocio, puede, administra: adminCompleto } = await cargarNegocio(slug, `/n/${slug}/inventarios`);
  const administra = puede("inventarios");
  const [{ data: inv }, { data: suc }, { data: con }] = await Promise.all([
    supabase.from("inventarios").select("id, nombre, actualizado, origen, estado").eq("negocio_id", negocio.id).order("nombre"),
    supabase.from("sucursales").select("id, nombre, es_principal, fuente").eq("negocio_id", negocio.id),
    administra
      ? supabase.from("conectores").select("id, nombre, visto, version, equipo, error").eq("negocio_id", negocio.id).order("creado")
      : Promise.resolve({ data: [] }),
  ]);
  const inventarios = (inv ?? []) as Inventario[];
  const sucursales = (suc ?? []) as Sucursal[];
  const conectores: ConectorFila[] = ((con ?? []) as Omit<ConectorFila, "inventarios">[]).map((c) => ({
    ...c, inventarios: inventarios.filter((i) => i.origen?.tipo === "conector" && i.origen.conector_id === c.id).map((i) => i.nombre),
  }));
  const nombreConector = (id?: string) => conectores.find((c) => c.id === id)?.nombre ?? "quitado";
  const principal = sucursales.find((s) => s.es_principal);
  // Quién usa cada inventario: las sucursales que lo eligieron y las que siguen a la Principal.
  const usos = (id: string) => sucursales.filter((s) => {
    const f = s.fuente?.tipo ? s.fuente : (s.es_principal ? s.fuente : principal?.fuente);
    return f?.tipo === "inventario" && f.inventario_id === id;
  }).map((s) => s.nombre);
  const cantidades = await Promise.all(inventarios.map(async (i) => {
    const { count } = await supabase.from("productos").select("codigo", { count: "exact", head: true }).eq("inventario_id", i.id);
    return count ?? 0;
  }));

  return (
    <>
      <Barra negocio={{ nombre: negocio.nombre, slug: negocio.slug }} />
      <main className="contenido">
        <h1>{negocio.nombre}</h1>
        <SubNav slug={slug} activa="inventarios" />
        <Aviso error={error} bien={bien} />
        <section className="tarjeta">
          <h2>Inventarios</h2>
          {inventarios.length === 0 ? (
            <p className="quieto" style={{ marginBottom: 0 }}>Todavía no hay inventarios. Carga tu primer Excel abajo.</p>
          ) : (
            <div className="desplazable">
              <table className="tabla">
                <thead><tr><th>Inventario</th><th>Origen</th><th className="num">Productos</th><th>Lo usa</th><th>Actualizado</th>{administra && <th />}</tr></thead>
                <tbody>
                  {inventarios.map((i, n) => (
                    <tr key={i.id}>
                      <td>
                        {administra ? (
                          <form action={renombrarInventario} className="fila" style={{ gap: 8, flexWrap: "nowrap" }}>
                            <input type="hidden" name="slug" value={slug} />
                            <input type="hidden" name="inventario" value={i.id} />
                            <input name="nombre" defaultValue={i.nombre} maxLength={80} required aria-label="Nombre del inventario" style={{ minWidth: 160 }} />
                            <button className="boton secundario" type="submit">Guardar</button>
                          </form>
                        ) : i.nombre}
                      </td>
                      <td className="pequeno">
                        {i.origen?.tipo === "google" ? (
                          <>
                            <span className="origen google">Google · {FRECUENCIAS.find((f) => f.min === (i.origen.cada_min ?? 60))?.texto ?? "cada hora"}</span>
                            {i.estado?.error
                              ? <span className="origen-estado error">Error {hace(i.estado.error_hora)}: {i.estado.error}</span>
                              : <span className="origen-estado quieto">Última carga {hace(i.estado?.ultimo)}</span>}
                            {administra && (
                              <>
                                <form action={actualizarGoogle} style={{ marginTop: 6 }}>
                                  <input type="hidden" name="slug" value={slug} />
                                  <input type="hidden" name="inventario" value={i.id} />
                                  <button className="boton secundario" type="submit">Actualizar ahora</button>
                                </form>
                                <details className="ajustes-fuente" style={{ marginTop: 6 }}>
                                  <summary>Cambiar enlace o frecuencia</summary>
                                  <form action={ajustarGoogle} className="fila">
                                    <input type="hidden" name="slug" value={slug} />
                                    <input type="hidden" name="inventario" value={i.id} />
                                    <input name="url" type="url" defaultValue={i.origen.url} aria-label="Enlace de la hoja" style={{ minWidth: 240 }} />
                                    <select name="cada_min" defaultValue={i.origen.cada_min ?? 60} aria-label="Frecuencia">
                                      {FRECUENCIAS.map((f) => <option key={f.min} value={f.min}>{f.texto}</option>)}
                                    </select>
                                    <button className="boton secundario" type="submit">Guardar</button>
                                  </form>
                                </details>
                              </>
                            )}
                          </>
                        ) : i.origen?.tipo === "conector" ? (
                          <>
                            <span className="origen conector">Conector · {nombreConector(i.origen.conector_id)}</span>
                            {i.estado?.error
                              ? <span className="origen-estado error">Error {hace(i.estado.error_hora)}: {i.estado.error}</span>
                              : <span className="origen-estado quieto">Última carga {hace(i.estado?.ultimo)}</span>}
                          </>
                        ) : <span className="origen">Excel / CSV</span>}
                      </td>
                      <td className="num">{cantidades[n].toLocaleString("es-DO")}</td>
                      <td>{usos(i.id).join(", ") || <span className="quieto">— nadie —</span>}</td>
                      <td className="quieto pequeno">{new Date(i.actualizado).toLocaleDateString("es-DO")}</td>
                      {administra && (
                        <td>
                          <a className="boton secundario" href={`/n/${slug}/inventarios/${i.id}/csv`} download
                            title="Descargar como CSV (se abre en Excel y se puede volver a cargar)" style={{ marginBottom: 6 }}>CSV</a>
                          <form action={eliminarInventario}>
                            <input type="hidden" name="slug" value={slug} />
                            <input type="hidden" name="inventario" value={i.id} />
                            <button className="boton secundario" type="submit" disabled={usos(i.id).length > 0}
                              title={usos(i.id).length ? "Lo usa una sucursal" : "Eliminar inventario y sus productos"}>Eliminar</button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="quieto pequeno" style={{ marginTop: 12, marginBottom: 0 }}>
            Cada sucursal elige de qué inventario toma sus precios en la pestaña Resumen.
            {adminCompleto && <> Respaldo: <a href={`/n/${slug}/respaldo`} download>descargar todo el negocio</a> (configuración,
            sucursales e inventarios). Un inventario se restaura cargando su CSV con «Reemplazar».
            ¿Vienes del sistema anterior? <a href={`/n/${slug}/importar`}>Importar su respaldo</a>.</>}
          </p>
        </section>
        {administra ? (
          <>
            {/* Los de Google y del conector se llenan solos: el Excel solo actualiza los de carga manual. */}
            <CargaInventario negocioId={negocio.id} moneda={negocio.moneda}
              inventarios={inventarios.filter((i) => !i.origen?.tipo).map((i) => ({ id: i.id, nombre: i.nombre, usos: usos(i.id) }))} />
            <FuenteGoogle negocioId={negocio.id} slug={slug} nombresUsados={inventarios.map((i) => i.nombre)} />
            <Conectores negocioId={negocio.id} slug={slug} conectores={conectores} sitio={sitio() || "https://prezio-jade.vercel.app"}
              descarga={DESCARGA_CONECTOR} nombresUsados={inventarios.map((i) => i.nombre)} />
          </>
        ) : (
          <p className="quieto" style={{ marginTop: 24 }}>Cargar inventarios requiere la casilla «Inventarios» (Usuarios).</p>
        )}
      </main>
    </>
  );
}
