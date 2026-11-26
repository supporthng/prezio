import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Inicio del panel: cómo está el negocio hoy (igual que el Inicio de la app Prezcio Administrador).
 * Cada cifra se pide con los permisos de quien entra: si no tiene permiso, esa tarjeta sale con «—».
 */
type Lic = { estado: string; dias: number | null; plan_nombre?: string; permanente?: boolean; dias_aviso?: number; limites?: { equipos?: number | null } };
type Dato = { et: string; num: string; pie: string; tono?: "" | "alerta" | "mal"; href: string };

const nf = new Intl.NumberFormat("es-DO");

export async function Tablero({ supabase, negocio, saludo }: {
  supabase: SupabaseClient; negocio: { id: string; slug: string; nombre: string }; saludo: string;
}) {
  const ahora = new Date();
  // Medianoche de hoy en República Dominicana (UTC-4, sin horario de verano).
  const rd = new Date(ahora.getTime() - 4 * 3600_000);
  const hoy = new Date(Date.UTC(rd.getUTCFullYear(), rd.getUTCMonth(), rd.getUTCDate(), 4)).toISOString();
  const base = `/n/${negocio.slug}`;

  const [lic, eq, cTotal, cNo, of, prod] = await Promise.all([
    supabase.rpc("licencia_detalle", { p_negocio: negocio.id }).then((r) => (r.error ? null : (r.data as Lic))),
    supabase.from("equipos").select("nombre, visto").eq("negocio_id", negocio.id).order("nombre").then((r) => (r.error ? null : (r.data as { nombre: string; visto: string | null }[]))),
    supabase.from("consultas").select("id", { count: "exact", head: true }).eq("negocio_id", negocio.id).gte("creado", hoy).then((r) => (r.error ? null : r.count ?? 0)),
    supabase.from("consultas").select("id", { count: "exact", head: true }).eq("negocio_id", negocio.id).gte("creado", hoy).eq("encontrado", false).then((r) => (r.error ? null : r.count ?? 0)),
    supabase.from("ofertas").select("nombre, activa, desde, hasta").eq("negocio_id", negocio.id).then((r) => (r.error ? null : (r.data as { nombre: string; activa: boolean; desde: string | null; hasta: string | null }[]))),
    supabase.from("productos").select("codigo", { count: "exact", head: true }).eq("negocio_id", negocio.id).then((r) => (r.error ? null : r.count ?? 0)),
  ]);

  const datos: Dato[] = [];
  let alerta: { tono: "mal" | "alerta"; texto: string } | null = null;

  if (lic) {
    const est: Record<string, string> = { prueba: "En prueba", activa: "Activa", por_vencer: "Por vencer", gracia: "En gracia", vencida: "Vencida", suspendida: "Suspendida" };
    const num = lic.dias == null ? (lic.permanente ? "Permanente" : est[lic.estado] ?? lic.estado)
      : lic.dias >= 0 ? `${lic.dias} ${lic.dias === 1 ? "día" : "días"}` : est[lic.estado] ?? lic.estado;
    const tono = ["vencida", "suspendida", "gracia"].includes(lic.estado) ? "mal"
      : lic.estado === "por_vencer" || (lic.dias != null && lic.dias <= (lic.dias_aviso ?? 15)) ? "alerta" : "";
    const pie = lic.estado === "prueba" ? "Quedan de prueba" : `Plan ${lic.plan_nombre ?? ""}${lic.dias != null && lic.dias >= 0 ? " · quedan" : ""}`;
    datos.push({ et: "Licencia", num, pie, tono, href: `${base}/licencia` });
    if (tono === "mal") alerta = { tono, texto: "La licencia necesita atención: los lectores pueden dejar de mostrar precios. Revísala en Licencia." };
    else if (tono === "alerta" && lic.dias != null) alerta = { tono, texto: `La licencia vence en ${lic.dias} ${lic.dias === 1 ? "día" : "días"}. Renueva desde Licencia para no quedarte sin precios.` };
  } else datos.push({ et: "Licencia", num: "—", pie: "Sin permiso para verla", href: `${base}/licencia` });

  if (eq) {
    const hace = (v: string | null) => (v ? (ahora.getTime() - new Date(v).getTime()) / 1000 : null);
    const conectados = eq.filter((e) => { const h = hace(e.visto); return h !== null && h < 86400; }).length;
    const sinSenal = eq.filter((e) => { const h = hace(e.visto); return h === null || h > 3 * 3600; }).map((e) => e.nombre).slice(0, 4);
    const lim = lic?.limites?.equipos ?? null;
    datos.push({ et: "Lectores conectados hoy", num: `${conectados} de ${lim ?? eq.length}`,
      pie: sinSenal.length ? `Sin señal ahora: ${sinSenal.join(", ")}` : eq.length ? "Todos conectados" : "Ningún lector vinculado todavía",
      tono: sinSenal.length ? "alerta" : "", href: `${base}/equipos` });
  } else datos.push({ et: "Lectores conectados hoy", num: "—", pie: "Sin permiso para verlos", href: `${base}/equipos` });

  if (cTotal !== null) {
    datos.push({ et: "Consultas de hoy", num: nf.format(cTotal),
      pie: cNo ? `${nf.format(cNo)} no encontrados (¿productos sin precio?)` : cTotal ? "Todos encontrados" : "Todavía nadie ha escaneado hoy",
      tono: cNo ? "alerta" : "", href: "#reporte" });
  } else datos.push({ et: "Consultas de hoy", num: "—", pie: "Sin permiso para el reporte", href: "#reporte" });

  if (of) {
    const t = ahora.getTime();
    const vig = of.filter((o) => o.activa && (!o.desde || new Date(o.desde).getTime() <= t) && (!o.hasta || new Date(o.hasta).getTime() > t));
    const pronto = vig.filter((o) => o.hasta && new Date(o.hasta).getTime() - t < 3 * 86400_000).sort((a, b) => (a.hasta! < b.hasta! ? -1 : 1))[0];
    datos.push({ et: "Ofertas en pantalla", num: nf.format(vig.length),
      pie: pronto ? `«${pronto.nombre}» vence ${new Date(pronto.hasta!).toLocaleDateString("es-DO", { day: "numeric", month: "short", timeZone: "America/Santo_Domingo" })}`
        : of.length ? `${of.length} creadas en total` : "Crea una para mostrarla junto al lector", href: `${base}/ofertas` });
  } else datos.push({ et: "Ofertas en pantalla", num: "—", pie: "Sin permiso para verlas", href: `${base}/ofertas` });

  datos.push({ et: "Productos", num: prod === null ? "—" : nf.format(prod), pie: "En tus inventarios", href: `${base}/inventarios` });

  const fecha = ahora.toLocaleDateString("es-DO", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Santo_Domingo" });
  return (
    <section className="ini-hero" aria-labelledby="ini-t">
      <div className="ini-cabeza">
        <div>
          <h1 id="ini-t">Hola, {saludo}</h1>
          <p>Así está {negocio.nombre} hoy, {fecha}.</p>
        </div>
        <a className="boton claro" href={base}>Actualizar</a>
      </div>
      <div className="tablero">
        {datos.map((d) => (
          <a key={d.et} className={`dato${d.tono ? ` ${d.tono}` : ""}`} href={d.href}>
            <span className="dato-et">{d.et}</span>
            <b className="dato-num">{d.num}</b>
            <span className="dato-pie">{d.pie}</span>
          </a>
        ))}
      </div>
      {alerta && <p className={`ini-alerta ${alerta.tono}`}>{alerta.texto}</p>}
    </section>
  );
}
