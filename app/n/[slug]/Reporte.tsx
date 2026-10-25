import Link from "next/link";

export type Resumen = {
  desde: string; total: number; no_encontrados: number;
  por_dia: { dia: string; total: number; no: number }[];
  mas_buscados: { codigo: string; nombre: string | null; veces: number }[];
  no_encontrados_top: { codigo: string; veces: number; ultima: string }[];
  por_sucursal: { sucursal: string; total: number }[];
};

const n = (x: number) => x.toLocaleString("es-DO");
const fechaCorta = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("es-DO", { day: "numeric", month: "short" });

/** Reporte de consultas: totales, por día y, sobre todo, los códigos que la gente buscó y no tenían precio. */
export function Reporte({ r, slug, dias }: { r: Resumen; slug: string; dias: number }) {
  // Días completos (los que no tuvieron consultas también salen, en cero).
  const serie: { dia: string; total: number; no: number }[] = [];
  const porDia = new Map(r.por_dia.map((d) => [d.dia, d]));
  for (let i = 0; i < dias; i++) {
    const d = new Date(Date.parse(r.desde) + i * 864e5 + 12 * 36e5).toISOString().slice(0, 10);
    serie.push(porDia.get(d) ?? { dia: d, total: 0, no: 0 });
  }
  const maximo = Math.max(1, ...serie.map((d) => d.total));
  const pctNo = r.total ? Math.round((r.no_encontrados / r.total) * 100) : 0;

  return (
    <section id="reporte" className="tarjeta reporte" aria-labelledby="t-reporte" style={{ marginBottom: 24 }}>
      <div className="reporte-cabeza">
        <h2 id="t-reporte">Consultas</h2>
        <nav className="reporte-rango" aria-label="Período">
          {[7, 30, 90].map((d) => (
            <Link key={d} href={`/n/${slug}?dias=${d}#reporte`} aria-current={d === dias ? "true" : undefined}>{d} días</Link>
          ))}
        </nav>
      </div>

      {r.total === 0 ? (
        <p className="quieto" style={{ margin: 0 }}>Todavía no hay consultas en estos {dias} días. Aparecen aquí en cuanto los clientes usen los verificadores.</p>
      ) : (
        <>
          <div className="reporte-cifras">
            <div><p className="reporte-numero">{n(r.total)}</p><p className="quieto pequeno">consultas</p></div>
            <div><p className="reporte-numero">{n(r.no_encontrados)}</p><p className="quieto pequeno">sin encontrar ({pctNo}%)</p></div>
            {r.por_sucursal.length > 1 && (
              <div><p className="reporte-numero texto">{r.por_sucursal[0].sucursal}</p><p className="quieto pequeno">sucursal con más consultas</p></div>
            )}
          </div>

          <figure className="reporte-barras" aria-label={`Consultas por día, últimos ${dias} días`}>
            <div className="reporte-plot" style={{ ["--columnas" as string]: serie.length }}>
              {serie.map((d) => (
                <div key={d.dia} className="reporte-columna" tabIndex={0}
                  aria-label={`${fechaCorta(d.dia)}: ${d.total} consultas, ${d.no} sin encontrar`}>
                  <span className="reporte-barra" style={{ height: `${(d.total / maximo) * 100}%` }} />
                  <span className="reporte-tip" role="tooltip">{fechaCorta(d.dia)} · <strong>{n(d.total)}</strong> consultas{d.no ? ` · ${n(d.no)} sin encontrar` : ""}</span>
                </div>
              ))}
            </div>
            <figcaption className="reporte-eje quieto pequeno">
              <span>{fechaCorta(serie[0].dia)}</span><span>máx. {n(maximo)} por día</span><span>{fechaCorta(serie[serie.length - 1].dia)}</span>
            </figcaption>
          </figure>

          <div className="reporte-listas">
            <div>
              <h3>Buscados y sin precio</h3>
              <p className="quieto pequeno">Códigos que los clientes escanearon y no estaban en el inventario: agrégalos.</p>
              {r.no_encontrados_top.length ? (
                <table className="tabla pequeno">
                  <thead><tr><th>Código</th><th className="num">Veces</th><th>Última vez</th></tr></thead>
                  <tbody>{r.no_encontrados_top.map((x) => (
                    <tr key={x.codigo}><td>{x.codigo}</td><td className="num">{n(x.veces)}</td><td className="quieto">{new Date(x.ultima).toLocaleDateString("es-DO")}</td></tr>
                  ))}</tbody>
                </table>
              ) : <p className="quieto pequeno">Ninguno: todo lo buscado tenía precio.</p>}
            </div>
            <div>
              <h3>Lo más consultado</h3>
              <p className="quieto pequeno">Los productos que más miran tus clientes.</p>
              <table className="tabla pequeno">
                <thead><tr><th>Producto</th><th className="num">Veces</th></tr></thead>
                <tbody>{r.mas_buscados.map((x) => (
                  <tr key={x.codigo}><td>{x.nombre ?? x.codigo}<span className="quieto"> · {x.codigo}</span></td><td className="num">{n(x.veces)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
