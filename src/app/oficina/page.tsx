import type { Metadata } from "next";
import Link from "next/link";
import { Indicador } from "@/components/Encabezado";
import { Icono, type NombreIcono } from "@/components/Icono";
import { perfilActual } from "@/lib/auth";
import { monto, montoEntero, NOMBRE_DOC, numeroDocumento } from "@/lib/facturacion";
import { fechaLarga, fechaSimple, hoyRD } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import type { ClienteCuenta, Factura, FacturaCobro, Secuencia, VisitaDetalle } from "@/lib/tipos";

export const metadata: Metadata = { title: "Inicio" };

function primerDiaMes(fecha: string, desplazar = 0) {
  const [a, m] = fecha.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + desplazar, 1));
  return d.toISOString().slice(0, 10);
}

function saludo() {
  const hora = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Santo_Domingo" }).format(new Date()));
  return hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
}

const nombreMesCorto = (inicio: string) =>
  new Intl.DateTimeFormat("es-DO", { month: "short", timeZone: "UTC" }).format(new Date(`${inicio}T12:00:00Z`)).replace(".", "");

export default async function Inicio() {
  const perfil = await perfilActual();
  const hoy = hoyRD();
  const mes = primerDiaMes(hoy);
  const hace6 = primerDiaMes(hoy, -5);
  const supabase = await supabaseServidor();

  const [
    { data: visitasHoy },
    { data: ventas },
    { data: cobrosData },
    { data: pendientes },
    { data: deudores },
    { data: secs },
    { data: productos },
    { count: porFacturar },
    { count: borradores },
    { count: reprogramar },
    { data: ultimas },
  ] = await Promise.all([
    supabase.from("visitas_detalle").select("id, estado, tecnico_id, tecnico").eq("fecha", hoy),
    supabase.from("facturas").select("fecha, total, tipo_doc, tasa_cambio").eq("estado", "emitida").in("tipo_doc", ["factura", "nota_credito"]).gte("fecha", hace6),
    supabase.from("cobros").select("fecha, total, tasa_cambio").eq("estado", "activo").gte("fecha", hace6),
    supabase.from("facturas_cobro").select("saldo_dop, vence, dias_vencida").gt("saldo", 0),
    supabase.from("clientes_cuenta").select("*").gt("pendiente", 0).order("pendiente", { ascending: false }).limit(5),
    supabase.from("secuencias_estado").select("*").eq("activa", true),
    supabase.from("productos").select("nombre, existencia, minimo, unidad").eq("activo", true).gt("minimo", 0),
    supabase.from("visitas_por_facturar").select("id", { count: "exact", head: true }),
    supabase.from("facturas").select("id", { count: "exact", head: true }).eq("estado", "borrador"),
    supabase.from("visitas_detalle").select("id", { count: "exact", head: true }).eq("por_reprogramar", true),
    supabase.from("facturas").select("id, tipo_doc, ncf, numero_proforma, estado, total, fecha, razon_social, cliente_nombre, moneda").neq("estado", "borrador").order("emitida_en", { ascending: false }).limit(6),
  ]);

  // --- Servicios de hoy
  const vh = (visitasHoy ?? []) as Pick<VisitaDetalle, "id" | "estado" | "tecnico_id" | "tecnico">[];
  const hechos = vh.filter((v) => v.estado === "realizada").length;
  const cancelados = vh.filter((v) => v.estado === "cancelada").length;
  const porTecnico = new Map<string, { nombre: string; total: number; hechos: number }>();
  for (const v of vh) {
    if (v.estado === "cancelada") continue;
    const k = v.tecnico_id ?? "sin";
    const t = porTecnico.get(k) ?? { nombre: v.tecnico ?? "Sin técnico", total: 0, hechos: 0 };
    t.total++;
    if (v.estado === "realizada") t.hechos++;
    porTecnico.set(k, t);
  }
  const tecnicos = [...porTecnico.values()].sort((a, b) => (a.nombre === "Sin técnico" ? 1 : b.nombre === "Sin técnico" ? -1 : a.nombre.localeCompare(b.nombre)));

  // --- Dinero
  const meses = Array.from({ length: 6 }, (_, i) => primerDiaMes(hoy, i - 5));
  const facturadoMes = new Map(meses.map((m) => [m, 0]));
  const cobradoMes = new Map(meses.map((m) => [m, 0]));
  for (const f of ventas ?? []) {
    const k = `${String(f.fecha).slice(0, 7)}-01`;
    if (facturadoMes.has(k)) facturadoMes.set(k, facturadoMes.get(k)! + (f.tipo_doc === "nota_credito" ? -1 : 1) * Number(f.total) * Number(f.tasa_cambio ?? 1));
  }
  for (const c of cobrosData ?? []) {
    const k = `${String(c.fecha).slice(0, 7)}-01`;
    if (cobradoMes.has(k)) cobradoMes.set(k, cobradoMes.get(k)! + Number(c.total) * Number(c.tasa_cambio ?? 1));
  }
  const facturadoEste = facturadoMes.get(mes) ?? 0;
  const cobradoEste = cobradoMes.get(mes) ?? 0;
  const pend = (pendientes ?? []) as Pick<FacturaCobro, "saldo_dop" | "vence" | "dias_vencida">[];
  const porCobrar = pend.reduce((s, f) => s + Number(f.saldo_dop), 0);
  const vencidas = pend.filter((f) => f.vence && f.vence < hoy);
  const vencido = vencidas.reduce((s, f) => s + Number(f.saldo_dop), 0);
  const maximo = Math.max(1, ...meses.map((m) => Math.max(facturadoMes.get(m)!, cobradoMes.get(m)!)));

  // --- Atención
  type Aviso = { titulo: string; texto: string; href: string; tono: "rojo" | "ambar" | "azul"; icono: NombreIcono };
  const avisos: Aviso[] = [];
  if (vencidas.length)
    avisos.push({ titulo: `${vencidas.length} factura${vencidas.length === 1 ? "" : "s"} vencida${vencidas.length === 1 ? "" : "s"}`, texto: `${montoEntero(vencido)} por cobrar`, href: "/oficina/cobros?ver=vencidas", tono: "rojo", icono: "alerta" });
  for (const s of ((secs ?? []) as Secuencia[]).filter((s) => s.estado !== "vigente"))
    avisos.push({
      titulo: `Secuencia ${s.tipo} ${s.estado === "agotada" ? "agotada" : s.estado === "vencida" ? "vencida" : "por agotarse"}`,
      texto: s.estado === "por_agotarse" ? `Quedan ${s.disponibles} comprobantes${s.vence ? ` · vence ${fechaSimple(s.vence)}` : ""}` : "Registra una nueva secuencia",
      href: "/oficina/facturacion/secuencias",
      tono: s.estado === "por_agotarse" ? "ambar" : "rojo",
      icono: "secuencia",
    });
  const bajos = (productos ?? []).filter((p) => Number(p.existencia) <= Number(p.minimo));
  if (bajos.length)
    avisos.push({ titulo: `${bajos.length} producto${bajos.length === 1 ? "" : "s"} bajo el mínimo`, texto: bajos.slice(0, 3).map((p) => p.nombre).join(", "), href: "/oficina/inventario", tono: "ambar", icono: "inventario" });
  if (porFacturar)
    avisos.push({ titulo: `${porFacturar} servicio${porFacturar === 1 ? "" : "s"} realizado${porFacturar === 1 ? "" : "s"} sin facturar`, texto: "Factúralos en un paso", href: "/oficina/facturacion/mes", tono: "azul", icono: "facturacion" });
  if (borradores)
    avisos.push({ titulo: `${borradores} borrador${borradores === 1 ? "" : "es"} sin emitir`, texto: "Revísalos y emítelos", href: "/oficina/facturacion?ver=borrador", tono: "azul", icono: "documento" });
  if (reprogramar)
    avisos.push({ titulo: `${reprogramar} servicio${reprogramar === 1 ? "" : "s"} por reprogramar`, texto: "Cancelados que esperan nueva fecha", href: "/oficina/reprogramar", tono: "ambar", icono: "reprogramar" });

  const tonoAviso = { rojo: "bg-orange-100 text-orange-700", ambar: "bg-amber-100 text-amber-700", azul: "bg-sky-100 text-sky-700" };
  const nombre = perfil?.nombre.split(/\s+/)[0] ?? "";
  const docs = (ultimas ?? []) as Factura[];
  const top = (deudores ?? []) as ClienteCuenta[];

  const accesos: { href: string; texto: string; icono: NombreIcono; principal?: boolean }[] = [
    { href: "/oficina/venta", texto: "Venta rápida", icono: "venta", principal: true },
    { href: "/oficina/cobros/nuevo", texto: "Registrar cobro", icono: "cobros" },
    { href: "/oficina/facturacion/nueva", texto: "Nueva factura", icono: "facturacion" },
    { href: "/oficina/agendar", texto: "Agendar servicio", icono: "calendario" },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-stone-500">{fechaLarga(hoy)}</p>
          <h1 className="titulo mt-0.5">
            {saludo()}
            {nombre ? `, ${nombre}` : ""}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {accesos.map((a) => (
            <Link key={a.href} href={a.href} className={a.principal ? "boton" : "boton-sec"}>
              <Icono nombre={a.icono} tam={16} /> {a.texto}
            </Link>
          ))}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          titulo="Servicios de hoy"
          valor={vh.length}
          detalle={`${hechos} hecho${hechos === 1 ? "" : "s"}${cancelados ? ` · ${cancelados} cancelado${cancelados === 1 ? "" : "s"}` : ""}`}
          icono="rutas"
          href={`/oficina/rutas?desde=${hoy}&hasta=${hoy}`}
          tono="oscuro"
        />
        <Indicador titulo="Facturado este mes" valor={montoEntero(facturadoEste)} detalle="Neto de notas de crédito" icono="facturacion" href="/oficina/facturacion" />
        <Indicador titulo="Cobrado este mes" valor={montoEntero(cobradoEste)} detalle={facturadoEste ? `${Math.round((cobradoEste / facturadoEste) * 100)} % de lo facturado` : "Recibos de ingreso"} icono="cobros" href="/oficina/cobros?ver=recibos" />
        <Indicador
          titulo="Por cobrar"
          valor={montoEntero(porCobrar)}
          detalle={vencido ? `${montoEntero(vencido)} vencido` : "Nada vencido"}
          icono="reloj"
          href="/oficina/cobros"
          tono={vencido ? "peligro" : "normal"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="tarjeta p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="subtitulo">Facturado y cobrado · últimos 6 meses</h2>
            <div className="flex items-center gap-4 text-xs font-semibold text-stone-600">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-marca-600" /> Facturado</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-lima" /> Cobrado</span>
            </div>
          </div>
          <div className="grid h-52 grid-cols-6 items-end gap-3 border-b border-stone-200 pb-0">
            {meses.map((m) => {
              const f = facturadoMes.get(m)!;
              const c = cobradoMes.get(m)!;
              return (
                <div key={m} className="flex h-full items-end justify-center gap-1" title={`${nombreMesCorto(m)}: facturado ${monto(f)}, cobrado ${monto(c)}`}>
                  <div className="w-1/3 max-w-7 rounded-t-md bg-marca-600" style={{ height: `${Math.max(2, (Math.max(f, 0) / maximo) * 100)}%` }} />
                  <div className="w-1/3 max-w-7 rounded-t-md bg-lima" style={{ height: `${Math.max(2, (c / maximo) * 100)}%` }} />
                </div>
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-6 gap-3 text-center text-xs font-semibold capitalize text-stone-500">
            {meses.map((m) => (
              <span key={m} className={m === mes ? "text-stone-900" : ""}>{nombreMesCorto(m)}</span>
            ))}
          </div>
        </section>

        <section className="tarjeta flex flex-col gap-2 p-5">
          <h2 className="subtitulo mb-1">Necesitan atención</h2>
          {avisos.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center text-sm text-stone-500">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-marca-50 text-marca-600"><Icono nombre="check" /></span>
              Todo al día.
            </div>
          ) : (
            avisos.slice(0, 6).map((a) => (
              <Link key={a.titulo} href={a.href} className="group flex items-center gap-3 rounded-xl bg-stone-50 px-3 py-2.5 transition hover:bg-stone-100">
                <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tonoAviso[a.tono]}`}>
                  <Icono nombre={a.icono} tam={17} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col text-sm">
                  <b className="truncate">{a.titulo}</b>
                  <span className="truncate text-[13px] text-stone-500">{a.texto}</span>
                </span>
                <Icono nombre="derecha" tam={16} className="text-stone-400 transition group-hover:translate-x-0.5" />
              </Link>
            ))
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="tarjeta p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="subtitulo">Ruta de hoy por técnico</h2>
            <Link href={`/oficina/rutas?desde=${hoy}&hasta=${hoy}`} className="text-[13px] font-semibold text-marca-600 hover:underline">Ver rutas</Link>
          </div>
          {tecnicos.length === 0 ? (
            <p className="py-4 text-sm text-stone-500">No hay servicios programados para hoy.</p>
          ) : (
            <ul className="space-y-4">
              {tecnicos.map((t) => {
                const p = t.total ? Math.round((t.hechos / t.total) * 100) : 0;
                return (
                  <li key={t.nombre}>
                    <div className="mb-1.5 flex justify-between text-sm">
                      <b className={t.nombre === "Sin técnico" ? "text-amber-700" : ""}>{t.nombre}</b>
                      <span className="tabular-nums text-stone-500">{t.hechos} de {t.total}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                      <div className={`h-full rounded-full ${p === 100 ? "bg-marca-500" : "bg-marca-600"}`} style={{ width: `${p}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="tarjeta p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="subtitulo">Quién debe más</h2>
            <Link href="/oficina/cobros" className="text-[13px] font-semibold text-marca-600 hover:underline">Cuentas por cobrar</Link>
          </div>
          {top.length === 0 ? (
            <p className="py-4 text-sm text-stone-500">Nadie tiene saldo pendiente.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {top.map((c) => (
                <li key={c.id}>
                  <Link href={`/oficina/cobros/cliente/${c.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-marca-700">
                    <span className="min-w-0">
                      <b className="block truncate">{c.nombre}</b>
                      <span className="text-xs text-stone-500">
                        {c.facturas_pendientes} factura{c.facturas_pendientes === 1 ? "" : "s"}
                        {c.max_dias_vencida ? ` · ${c.max_dias_vencida} días vencida` : ""}
                      </span>
                    </span>
                    <span className={`shrink-0 font-bold tabular-nums ${c.max_dias_vencida ? "text-orange-700" : ""}`}>{montoEntero(c.pendiente)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="tarjeta p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="subtitulo">Últimos documentos</h2>
            <Link href="/oficina/facturacion" className="text-[13px] font-semibold text-marca-600 hover:underline">Facturación</Link>
          </div>
          {docs.length === 0 ? (
            <p className="py-4 text-sm text-stone-500">Todavía no hay documentos emitidos.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {docs.map((d) => (
                <li key={d.id}>
                  <Link href={`/oficina/facturacion/${d.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-marca-700">
                    <span className="min-w-0">
                      <b className="block truncate font-mono text-[13px]">{numeroDocumento(d)}</b>
                      <span className="block truncate text-xs text-stone-500">{NOMBRE_DOC[d.tipo_doc]} · {d.razon_social ?? d.cliente_nombre}</span>
                    </span>
                    <span className={`shrink-0 font-semibold tabular-nums ${d.estado === "anulada" ? "text-stone-400 line-through" : ""}`}>
                      {d.tipo_doc === "nota_credito" ? "−" : ""}{d.moneda && d.moneda !== "DOP" ? monto(d.total, d.moneda) : montoEntero(d.total)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
