import { Barra } from "@/components/Barra";
import { Aviso } from "@/components/Aviso";
import { SubNav } from "@/components/SubNav";
import { cargarNegocio } from "@/lib/negocio";
import { CargaInventario } from "./CargaInventario";
import { eliminarInventario, renombrarInventario } from "./actions";

export const metadata = { title: "Inventarios" };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ bien?: string; error?: string }> };
type Inventario = { id: string; nombre: string; actualizado: string };
type Sucursal = { id: string; nombre: string; es_principal: boolean; fuente: { tipo?: string; inventario_id?: string } };

export default async function Inventarios({ params, searchParams }: Props) {
  const { slug } = await params;
  const { bien, error } = await searchParams;
  const { supabase, negocio, administra } = await cargarNegocio(slug, `/n/${slug}/inventarios`);
  const [{ data: inv }, { data: suc }] = await Promise.all([
    supabase.from("inventarios").select("id, nombre, actualizado").eq("negocio_id", negocio.id).order("nombre"),
    supabase.from("sucursales").select("id, nombre, es_principal, fuente").eq("negocio_id", negocio.id),
  ]);
  const inventarios = (inv ?? []) as Inventario[];
  const sucursales = (suc ?? []) as Sucursal[];
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
                <thead><tr><th>Inventario</th><th className="num">Productos</th><th>Lo usa</th><th>Actualizado</th>{administra && <th />}</tr></thead>
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
                      <td className="num">{cantidades[n].toLocaleString("es-DO")}</td>
                      <td>{usos(i.id).join(", ") || <span className="quieto">— nadie —</span>}</td>
                      <td className="quieto pequeno">{new Date(i.actualizado).toLocaleDateString("es-DO")}</td>
                      {administra && (
                        <td>
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
          </p>
        </section>
        {administra ? (
          <CargaInventario negocioId={negocio.id} moneda={negocio.moneda}
            inventarios={inventarios.map((i) => ({ id: i.id, nombre: i.nombre, usos: usos(i.id) }))} />
        ) : (
          <p className="quieto" style={{ marginTop: 24 }}>Solo el dueño o un administrador cargan inventarios.</p>
        )}
      </main>
    </>
  );
}
