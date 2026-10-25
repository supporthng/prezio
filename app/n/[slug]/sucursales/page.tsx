import { Barra } from "@/components/Barra";
import { Aviso } from "@/components/Aviso";
import { SubNav } from "@/components/SubNav";
import { cargarNegocio } from "@/lib/negocio";
import { sitio } from "@/lib/util";
import { Ubicacion } from "../Ubicacion";
import { QrSucursal } from "./QrSucursal";
import { cambiarConsultaMovil, cambiarFuente, crearSucursal, renombrarSucursal } from "../actions";

export const metadata = { title: "Sucursales" };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ bien?: string; error?: string }> };
type Sucursal = { id: string; nombre: string; codigo: string; es_principal: boolean; activa: boolean; fuente: { tipo?: string; inventario_id?: string };
  geo_activa: boolean; latitud: number | null; longitud: number | null; radio_m: number };

export default async function Sucursales({ params, searchParams }: Props) {
  const { slug } = await params;
  const { bien, error } = await searchParams;
  const { supabase, negocio, puede, alcance } = await cargarNegocio(slug, `/n/${slug}/sucursales`);
  const [{ data: suc }, { data: inv }, { data: neg }] = await Promise.all([
    supabase.from("sucursales").select("id, nombre, codigo, es_principal, activa, fuente, geo_activa, latitud, longitud, radio_m")
      .eq("negocio_id", negocio.id).order("es_principal", { ascending: false }).order("nombre"),
    supabase.from("inventarios").select("id, nombre").eq("negocio_id", negocio.id).order("nombre"),
    supabase.from("negocios").select("consulta_movil, apariencia").eq("id", negocio.id).maybeSingle(),
  ]);
  const todas = (suc ?? []) as Sucursal[];
  // Quien tiene permisos solo en algunas sucursales ve esas.
  const sucursales = alcance === null ? todas : todas.filter((s) => alcance.includes(s.id) || puede("sucursales", s.id));
  const inventarios = (inv ?? []) as { id: string; nombre: string }[];
  const movilActiva = Boolean((neg as { consulta_movil?: boolean } | null)?.consulta_movil);
  const puedeApariencia = puede("apariencia");
  const ap = ((neg as { apariencia?: { logo?: string | null; mostrar_logo?: boolean } } | null)?.apariencia) ?? {};
  const faltaLogo = !ap.logo || ap.mostrar_logo === false;
  const base = sitio() || "https://prezio-jade.vercel.app";

  return (
    <>
      <Barra negocio={{ nombre: negocio.nombre, slug: negocio.slug }} />
      <main className="contenido">
        <h1>{negocio.nombre}</h1>
        <SubNav slug={slug} activa="sucursales" />
        <Aviso error={error} bien={bien} />

        <section className="tarjeta movil-activar" aria-labelledby="t-movil">
          <div>
            <h2 id="t-movil">Consulta desde el celular</h2>
            <p className="quieto" style={{ margin: 0 }}>
              Tus clientes escanean el QR de la sucursal con su celular y ven el precio con la cámara, sin instalar nada.
              {movilActiva ? " Está activa." : " Está apagada: actívala para que el enlace y el QR funcionen."}
            </p>
          </div>
          {puedeApariencia ? (
            <form action={cambiarConsultaMovil}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="negocio" value={negocio.id} />
              <input type="hidden" name="activa" value={movilActiva ? "no" : "si"} />
              <button className={`boton${movilActiva ? " secundario" : ""}`} type="submit">{movilActiva ? "Apagar" : "Activar"}</button>
            </form>
          ) : <span className="quieto pequeno">La activa quien tenga la casilla «Apariencia».</span>}
        </section>

        {faltaLogo && (
          <p className="aviso error" style={{ marginTop: 16 }}>
            {ap.logo ? "El logo está oculto" : "Todavía no has subido el logo del negocio"}: la consulta del celular y los verificadores
            muestran solo el nombre. <a href={`/n/${slug}/apariencia`}>{ap.logo ? "Actívalo en Apariencia" : "Súbelo en Apariencia"}</a>.
          </p>
        )}

        <section className="tarjeta" aria-labelledby="t-sucursales" style={{ marginTop: 20 }}>
          <h2 id="t-sucursales">Sucursales</h2>
          <ul className="lista sucursales">
            {sucursales.map((s) => {
              const editar = puede("sucursales", s.id);
              const enlace = `${base}/c/${slug}/${s.codigo}`;
              return (
                <li key={s.id}>
                  {editar ? (
                    <form action={renombrarSucursal} className="fila" style={{ flex: 1 }}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="sucursal" value={s.id} />
                      <div className="campo" style={{ marginBottom: 0 }}>
                        <label className="pequeno quieto" htmlFor={`n-${s.id}`}>{s.es_principal ? "Principal" : "Sucursal"}</label>
                        <input id={`n-${s.id}`} name="nombre" defaultValue={s.nombre} maxLength={80} required />
                      </div>
                      <button className="boton secundario" type="submit">Guardar</button>
                    </form>
                  ) : <span><strong>{s.nombre}</strong></span>}
                  {editar ? (
                    <form action={cambiarFuente} className="fila" style={{ flex: "1 1 260px" }}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="sucursal" value={s.id} />
                      <div className="campo" style={{ marginBottom: 0 }}>
                        <label className="pequeno quieto" htmlFor={`f-${s.id}`}>Precios desde</label>
                        <select id={`f-${s.id}`} name="fuente" defaultValue={s.fuente?.tipo === "inventario" ? s.fuente.inventario_id : ""}>
                          <option value="">{s.es_principal ? "— elige un inventario —" : "Igual que la Principal"}</option>
                          {inventarios.map((i) => <option key={i.id} value={i.id}>Inventario: {i.nombre}</option>)}
                        </select>
                      </div>
                      <button className="boton secundario" type="submit">Usar</button>
                      <p className="quieto pequeno" style={{ flexBasis: "100%", margin: 0 }}>
                        ¿Desde Google Drive o SQL Server? Créalo en Inventarios ›{" "}
                        <a href={`/n/${slug}/inventarios#t-google`}>Inventario desde Google</a> o{" "}
                        <a href={`/n/${slug}/inventarios#t-conector`}>Conector de SQL Server</a>, y elígelo aquí.
                      </p>
                    </form>
                  ) : (
                    <span className="pequeno quieto">
                      {s.fuente?.tipo === "inventario" ? `Precios: ${inventarios.find((i) => i.id === s.fuente.inventario_id)?.nombre ?? "—"}`
                        : s.es_principal ? "Sin inventario" : "Igual que la Principal"}
                    </span>
                  )}
                  {editar && (
                    <Ubicacion slug={slug} sucursal={s.id} nombre={s.nombre}
                      geo={{ activa: s.geo_activa, latitud: s.latitud, longitud: s.longitud, radio_m: s.radio_m }} />
                  )}
                  <details className="ubicacion">
                    <summary>Enlace y QR para el celular <span className="quieto pequeno">· {movilActiva ? (s.activa ? "activo" : "sucursal inactiva") : "consulta apagada"}</span></summary>
                    <div className="ubicacion-cuerpo">
                      {!movilActiva && <p className="aviso error" style={{ marginTop: 0 }}>La consulta desde el celular está apagada: el enlace dirá que no está activa. Actívala arriba.</p>}
                      <QrSucursal url={enlace} negocio={negocio.nombre} sucursal={s.nombre} archivo={`${slug}-${s.codigo}`}
                        negocioId={negocio.id} puedeApariencia={puedeApariencia} />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
          {puede("sucursales") && (
            <form action={crearSucursal} className="fila" style={{ marginTop: 16 }}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="negocio" value={negocio.id} />
              <div className="campo" style={{ marginBottom: 0 }}>
                <label htmlFor="nueva-suc">Nueva sucursal</label>
                <input id="nueva-suc" name="nombre" maxLength={80} placeholder="Ej.: Sucursal Centro" required />
              </div>
              <button className="boton" type="submit">Agregar</button>
            </form>
          )}
        </section>
      </main>
    </>
  );
}
