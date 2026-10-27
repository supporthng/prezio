import type { Metadata } from "next";
import Link from "next/link";
import { Estado } from "@/components/Estado";
import { BotonEnviar, Formulario } from "@/components/Formulario";
import { catalogos } from "@/lib/datos";
import { dinero, enlaceWhatsapp, fechaLarga, hoyRD, horaRD, sumarDias } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import type { VisitaDetalle } from "@/lib/tipos";
import { generarVisitas } from "../acciones";
import { AccionesVisita } from "../AccionesVisita";
import { CasillaLote, Lote, MarcarDia } from "../Lote";

export const metadata: Metadata = { title: "Rutas" };

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function finDelMesSiguiente(hoy: string) {
  const [a, m] = hoy.split("-").map(Number);
  const fin = new Date(Date.UTC(a, m + 1, 0)); // último día del mes siguiente
  return fin.toISOString().slice(0, 10);
}

export default async function Rutas({ searchParams }: PageProps<"/oficina/rutas">) {
  const sp = await searchParams;
  const hoy = hoyRD();
  const desde = uno(sp.desde) || hoy;
  const hasta = uno(sp.hasta) || sumarDias(desde, 6);
  const region = uno(sp.region);
  const tecnico = uno(sp.tecnico);
  const estado = uno(sp.estado);

  const supabase = await supabaseServidor();
  const cat = await catalogos();

  let consulta = supabase
    .from("visitas_detalle")
    .select("*")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha")
    .order("region", { nullsFirst: false })
    .order("zona", { nullsFirst: false })
    .order("cliente")
    .limit(2000);
  if (region === "sin") consulta = consulta.is("region_id", null);
  else if (region) consulta = consulta.eq("region_id", region);
  if (tecnico === "sin") consulta = consulta.is("tecnico_id", null);
  else if (tecnico) consulta = consulta.eq("tecnico_id", tecnico);
  if (estado) consulta = consulta.eq("estado", estado);

  const { data, error } = await consulta;
  const visitas = (data ?? []) as VisitaDetalle[];

  const dias = new Map<string, VisitaDetalle[]>();
  for (const v of visitas) {
    if (!dias.has(v.fecha)) dias.set(v.fecha, []);
    dias.get(v.fecha)!.push(v);
  }

  const total = visitas.length;
  const realizadas = visitas.filter((v) => v.estado === "realizada").length;
  const canceladas = visitas.filter((v) => v.estado === "cancelada").length;
  const pendientes = total - realizadas - canceladas;
  const montoRealizado = visitas.filter((v) => v.estado === "realizada").reduce((s, v) => s + (Number(v.precio) || 0), 0);

  const diaSemana = new Date(`${hoy}T12:00:00Z`).getUTCDay() || 7; // 1 = lunes
  const lunes = sumarDias(hoy, 1 - diaSemana);
  const [anio, mes] = hoy.split("-").map(Number);
  const inicioMes = `${hoy.slice(0, 7)}-01`;
  const finMes = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
  const atajos = [
    { texto: "Hoy", desde: hoy, hasta: hoy },
    { texto: "Mañana", desde: sumarDias(hoy, 1), hasta: sumarDias(hoy, 1) },
    { texto: "Esta semana", desde: lunes, hasta: sumarDias(lunes, 6) },
    { texto: "Próxima semana", desde: sumarDias(lunes, 7), hasta: sumarDias(lunes, 13) },
    { texto: "Este mes", desde: inicioMes, hasta: finMes },
  ];
  const conFiltros = (d: string, h: string) => {
    const q = new URLSearchParams({ desde: d, hasta: h });
    if (region) q.set("region", region);
    if (tecnico) q.set("tecnico", tecnico);
    if (estado) q.set("estado", estado);
    return `/oficina/rutas?${q}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo">Rutas</h1>
          <p className="text-sm text-stone-500">Servicios programados por día, región y técnico.</p>
        </div>
        <div className="flex flex-wrap gap-2">
        <Link href="/oficina/agendar" className="boton">+ Agendar servicio</Link>
        <details className="relative">
          <summary className="boton-sec cursor-pointer list-none">Generar visitas</summary>
          <div className="tarjeta absolute right-0 z-10 mt-2 w-80 p-4">
            <p className="mb-3 text-sm text-stone-600">
              Crea las visitas de todas las sucursales activas según su frecuencia. Puedes repetirlo: no duplica.
            </p>
            <Formulario accion={generarVisitas} className="space-y-3">
              <div>
                <label className="etiqueta" htmlFor="hasta-gen">Hasta</label>
                <input id="hasta-gen" type="date" name="hasta" className="campo" defaultValue={finDelMesSiguiente(hoy)} required />
              </div>
              <BotonEnviar pendiente="Generando…">Generar</BotonEnviar>
            </Formulario>
          </div>
        </details>
        </div>
      </div>

      <form className="tarjeta grid grid-cols-2 gap-3 p-4 md:grid-cols-6" method="get">
        <div>
          <label className="etiqueta" htmlFor="desde">Desde</label>
          <input id="desde" type="date" name="desde" defaultValue={desde} className="campo" />
        </div>
        <div>
          <label className="etiqueta" htmlFor="hasta">Hasta</label>
          <input id="hasta" type="date" name="hasta" defaultValue={hasta} className="campo" />
        </div>
        <div>
          <label className="etiqueta" htmlFor="region">Región</label>
          <select id="region" name="region" defaultValue={region} className="campo">
            <option value="">Todas</option>
            {cat.regiones.map((r) => (
              <option key={r.id} value={r.id}>{r.nombre}</option>
            ))}
            <option value="sin">Sin región</option>
          </select>
        </div>
        <div>
          <label className="etiqueta" htmlFor="tecnico">Técnico</label>
          <select id="tecnico" name="tecnico" defaultValue={tecnico} className="campo">
            <option value="">Todos</option>
            {cat.usuarios.filter((u) => u.rol === "tecnico").map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}{t.activo ? "" : " (inactivo)"}</option>
            ))}
            <option value="sin">Sin asignar</option>
          </select>
        </div>
        <div>
          <label className="etiqueta" htmlFor="estado">Estado</label>
          <select id="estado" name="estado" defaultValue={estado} className="campo">
            <option value="">Todos</option>
            <option value="programada">Programada</option>
            <option value="realizada">Realizada</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button className="boton flex-1">Ver</button>
          <Link href="/oficina/rutas" className="boton-sec">Limpiar</Link>
        </div>
        <div className="col-span-full flex flex-wrap gap-2">
          {atajos.map((a) => (
            <Link
              key={a.texto}
              href={conFiltros(a.desde, a.hasta)}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${
                desde === a.desde && hasta === a.hasta
                  ? "bg-marca-600 text-white ring-marca-600"
                  : "bg-white text-stone-600 ring-stone-300 hover:bg-stone-50"
              }`}
            >
              {a.texto}
            </Link>
          ))}
        </div>
      </form>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Resumen titulo="Pendientes" valor={pendientes} />
        <Resumen titulo="Realizadas" valor={realizadas} />
        <Resumen titulo="Canceladas" valor={canceladas} />
        <Resumen titulo="Monto realizado" valor={dinero(montoRealizado)} />
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">No se pudieron cargar las visitas: {error.message}</p>}

      {!error && total === 0 && (
        <div className="tarjeta p-8 text-center text-sm text-stone-500">
          No hay visitas en estas fechas.{" "}
          {cat.servicios.length === 0
            ? "Empieza por Ajustes: agrega tus servicios y regiones, y luego tus clientes."
            : "Si ya tienes clientes con sucursales, usa «Generar visitas»."}
        </div>
      )}

      <Lote tecnicos={cat.tecnicos} hoy={hoy}>
        <div className="space-y-5 pb-20">
          {[...dias.entries()].map(([fecha, lista]) => {
            const porTecnico = new Map<string, number>();
            for (const v of lista) {
              if (v.estado !== "programada") continue;
              const k = v.tecnico ?? "Sin técnico";
              porTecnico.set(k, (porTecnico.get(k) ?? 0) + 1);
            }
            return (
              <section key={fecha} className="space-y-2">
                <h2 className="sticky top-[104px] z-10 bg-[#f5f7f5]/95 py-1 text-sm font-semibold text-stone-700 backdrop-blur">
                  {fechaLarga(fecha)}
                  {fecha === hoy && <span className="ml-2 rounded bg-lime-200 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-lime-900">hoy</span>}
                  <span className="ml-2 font-normal text-stone-400">{lista.length} {lista.length === 1 ? "servicio" : "servicios"}</span>
                  <MarcarDia ids={lista.filter((v) => v.estado === "programada").map((v) => v.id)} />
                  {porTecnico.size > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1.5 text-xs font-normal">
                      {[...porTecnico.entries()].map(([t, n]) => (
                        <span key={t} className={`rounded-full px-2 py-0.5 ${t === "Sin técnico" ? "bg-amber-100 text-amber-900" : "bg-stone-200/70 text-stone-700"}`}>
                          {t}: {n}
                        </span>
                      ))}
                    </span>
                  )}
                </h2>
                <ul className="tarjeta divide-y divide-stone-100">
                  {lista.map((v) => (
                    <FilaVisita key={v.id} v={v} cat={cat} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </Lote>
    </div>
  );
}

function Resumen({ titulo, valor }: { titulo: string; valor: string | number }) {
  return (
    <div className="tarjeta px-4 py-3">
      <div className="text-xs text-stone-500">{titulo}</div>
      <div className="text-lg font-semibold text-stone-900">{valor}</div>
    </div>
  );
}

function FilaVisita({ v, cat }: { v: VisitaDetalle; cat: Awaited<ReturnType<typeof catalogos>> }) {
  const recordatorio = [
    `Hola${v.contacto_nombre ? ` ${v.contacto_nombre}` : ""}, le recordamos el servicio de ${v.servicio ?? "fumigación"} en ${v.cliente} – ${v.sucursal} el ${fechaLarga(v.fecha)}.`,
    v.instrucciones ? `\nPreparación: ${v.instrucciones}` : "",
  ].join("");
  const wa = enlaceWhatsapp(v.contacto_whatsapp, recordatorio);

  return (
    <li className="flex flex-col gap-3 p-3 md:flex-row md:items-start md:justify-between">
      <div className="flex min-w-0 gap-3">
      {v.estado === "programada" ? <CasillaLote id={v.id} /> : <span className="w-4 shrink-0" />}
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/oficina/clientes/${v.cliente_id}`} className="font-medium text-stone-900 hover:underline">
            {v.cliente}
          </Link>
          <span className="text-stone-400">·</span>
          <span className="text-stone-700">{v.sucursal}</span>
          <Estado estado={v.estado} porReprogramar={v.por_reprogramar} />
          {v.origen === "reprogramada" && <span className="text-xs text-amber-700">reprogramada</span>}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500">
          <span>{v.servicio ?? "Sin servicio"}</span>
          <span>{[v.zona, v.region].filter(Boolean).join(", ") || "Sin zona"}</span>
          <span>{v.tecnico ? `Técnico: ${v.tecnico}` : <b className="text-amber-700">Sin técnico</b>}</span>
          <span>{dinero(v.precio)}</span>
          {v.direccion && <span className="truncate">{v.direccion}</span>}
        </div>
        {v.estado === "realizada" && v.realizada_en && (
          <div className="text-xs text-marca-700">Hecha a las {horaRD(v.realizada_en)}</div>
        )}
        {v.estado === "cancelada" && <div className="text-xs text-red-700">Motivo: {v.motivo_cancelacion}</div>}
        {v.notas_tecnico && <div className="text-xs italic text-stone-600">«{v.notas_tecnico}»</div>}
      </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-start gap-2">
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="boton-sec boton-chico" title="Enviar recordatorio por WhatsApp">
            WhatsApp
          </a>
        )}
        <AccionesVisita
          visita={{ id: v.id, estado: v.estado, fecha: v.fecha, tecnico_id: v.tecnico_id, por_reprogramar: v.por_reprogramar }}
          motivos={cat.motivos.filter((m) => m.activo)}
          tecnicos={cat.tecnicos}
        />
      </div>
    </li>
  );
}
