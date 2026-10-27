import type { Metadata } from "next";
import Link from "next/link";
import { chipEstado, chipPago, monto, NOMBRE_DOC, numeroDocumento, TEXTO_ECF } from "@/lib/facturacion";
import { Icono } from "@/components/Icono";
import { fechaSimple, hoyRD } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Factura, FacturaCobro, Secuencia } from "@/lib/tipos";

export const metadata: Metadata = { title: "Facturación" };

const pestanas = [
  { valor: "todas", texto: "Todas" },
  { valor: "factura", texto: "Facturas" },
  { valor: "proforma", texto: "Proformas" },
  { valor: "nota_credito", texto: "Notas de crédito" },
  { valor: "borrador", texto: "Borradores" },
];

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function rangoMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  const fin = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(fin).padStart(2, "0")}` };
}

function nombreMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString("es-DO", { month: "long", year: "numeric", timeZone: "UTC" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function moverMes(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function Facturacion({ searchParams }: PageProps<"/oficina/facturacion">) {
  const sp = await searchParams;
  const hoy = hoyRD();
  const ver = uno(sp.ver) ?? (uno(sp.estado) === "borrador" ? "borrador" : "todas");
  const mesParam = uno(sp.mes);
  const mes = mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : hoy.slice(0, 7);
  const q = (uno(sp.q) ?? "").trim();
  const creadas = uno(sp.creadas);
  const { desde, hasta } = rangoMes(mes);

  const supabase = await supabaseServidor();
  let consulta = supabase
    .from("facturas")
    .select("*, clientes(nombre, razon_social, rnc)")
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false })
    .limit(500);
  if (ver === "borrador") consulta = consulta.eq("estado", "borrador");
  else {
    consulta = consulta.gte("fecha", desde).lte("fecha", hasta);
    if (ver !== "todas") consulta = consulta.eq("tipo_doc", ver);
  }

  const [{ data }, { data: delMes }, { count: pendientes }, { count: borradores }, { data: secs }] = await Promise.all([
    consulta,
    supabase.from("facturas").select("tipo_doc, total, itbis, tasa_cambio").eq("estado", "emitida").gte("fecha", desde).lte("fecha", hasta).in("tipo_doc", ["factura", "nota_credito"]),
    supabase.from("visitas_por_facturar").select("id", { count: "exact", head: true }),
    supabase.from("facturas").select("id", { count: "exact", head: true }).eq("estado", "borrador"),
    supabase.from("secuencias_estado").select("*").eq("activa", true),
  ]);

  type Fila = Factura & { clientes: { nombre: string; razon_social: string | null; rnc: string | null } | null };
  let docs = (data ?? []) as Fila[];
  const { data: cobrosData } =
    ver !== "borrador"
      ? await supabase.from("facturas_cobro").select("id, saldo, estado_pago, dias_vencida").gte("fecha", desde).lte("fecha", hasta).limit(5000)
      : { data: [] };
  const cobro = new Map(((cobrosData ?? []) as Pick<FacturaCobro, "id" | "saldo" | "estado_pago" | "dias_vencida">[]).map((c) => [c.id, c]));
  if (q) {
    const t = q.toLowerCase();
    docs = docs.filter((f) =>
      [f.ncf, f.numero_proforma, f.cliente_nombre, f.razon_social, f.rnc, f.clientes?.nombre, f.clientes?.razon_social, f.clientes?.rnc].some((x) =>
        x?.toLowerCase().includes(t),
      ),
    );
  }

  const signo = (f: { tipo_doc: string }) => (f.tipo_doc === "nota_credito" ? -1 : 1);
  const facturado = (delMes ?? []).reduce((s, f) => s + signo(f) * Number(f.total) * Number(f.tasa_cambio ?? 1), 0);
  const itbis = (delMes ?? []).reduce((s, f) => s + signo(f) * Number(f.itbis) * Number(f.tasa_cambio ?? 1), 0);
  const alertas = ((secs ?? []) as Secuencia[]).filter((s) => s.estado !== "vigente");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo">Facturación</h1>
          <p className="text-sm text-stone-500">Facturas con comprobante fiscal (serie B y e-CF), proformas y notas de crédito.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/oficina/facturacion/mes" className="boton-sec"><Icono nombre="rutas" tam={16} /> Facturar servicios del mes</Link>
          <Link href="/oficina/facturacion/nueva?tipo=proforma" className="boton-sec"><Icono nombre="documento" tam={16} /> Nueva proforma</Link>
          <Link href="/oficina/venta" className="boton-sec"><Icono nombre="venta" tam={16} /> Venta rápida</Link>
          <Link href="/oficina/facturacion/nueva" className="boton"><Icono nombre="mas" tam={16} /> Nueva factura</Link>
        </div>
      </div>

      <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Más de facturación">
        <Link href="/oficina/facturacion/secuencias" className="inline-flex items-center gap-1.5 font-semibold text-marca-600 hover:underline"><Icono nombre="secuencia" tam={15} /> Secuencias de comprobantes</Link>
        <Link href="/oficina/facturacion/reportes" className="inline-flex items-center gap-1.5 font-semibold text-marca-600 hover:underline"><Icono nombre="reporte" tam={15} /> Reportes 607 y 608</Link>
        <Link href="/oficina/cobros" className="inline-flex items-center gap-1.5 font-semibold text-marca-600 hover:underline"><Icono nombre="cobros" tam={15} /> Cuentas por cobrar</Link>
      </nav>

      {creadas && (
        <p role="status" className="rounded-md bg-marca-50 px-3 py-2 text-sm text-marca-800">
          Se crearon {creadas} borrador{creadas === "1" ? "" : "es"}. Revísalos y emítelos.
        </p>
      )}
      {alertas.map((s) => (
        <p key={s.id} role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {s.tipo}:{" "}
          {s.estado === "agotada"
            ? "la secuencia se agotó."
            : s.estado === "vencida"
              ? `la secuencia venció el ${fechaSimple(s.vence!)}.`
              : `quedan ${s.disponibles} números.`}{" "}
          <Link href="/oficina/facturacion/secuencias" className="font-medium underline">Registrar nueva secuencia</Link>
        </p>
      ))}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="tarjeta p-4">
          <div className="text-xs font-medium text-stone-500">Facturado en {nombreMes(mes).toLowerCase()}</div>
          <div className="text-xl font-semibold tabular-nums">{monto(facturado)}</div>
        </div>
        <div className="tarjeta p-4">
          <div className="text-xs font-medium text-stone-500">ITBIS del mes</div>
          <div className="text-xl font-semibold tabular-nums">{monto(itbis)}</div>
        </div>
        <Link href="/oficina/facturacion/mes" className="tarjeta p-4 hover:bg-stone-50">
          <div className="text-xs font-medium text-stone-500">Servicios realizados sin facturar</div>
          <div className="text-xl font-semibold tabular-nums">{pendientes ?? 0}</div>
        </Link>
        <Link href="/oficina/facturacion?ver=borrador" className="tarjeta p-4 hover:bg-stone-50">
          <div className="text-xs font-medium text-stone-500">Borradores sin emitir</div>
          <div className="text-xl font-semibold tabular-nums">{borradores ?? 0}</div>
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {pestanas.map((p) => (
            <Link
              key={p.valor}
              href={`/oficina/facturacion?ver=${p.valor}&mes=${mes}`}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${
                ver === p.valor ? "bg-marca-600 text-white ring-marca-600" : "bg-white text-stone-600 ring-stone-300 hover:bg-stone-50"
              }`}
            >
              {p.texto}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ver !== "borrador" && (
            <div className="flex items-center gap-1 text-sm">
              <Link href={`/oficina/facturacion?ver=${ver}&mes=${moverMes(mes, -1)}`} className="rounded px-2 py-1 hover:bg-stone-100" aria-label="Mes anterior">‹</Link>
              <span className="min-w-36 text-center font-medium">{nombreMes(mes)}</span>
              <Link href={`/oficina/facturacion?ver=${ver}&mes=${moverMes(mes, 1)}`} className="rounded px-2 py-1 hover:bg-stone-100" aria-label="Mes siguiente">›</Link>
            </div>
          )}
          <form className="flex gap-2">
            <input type="hidden" name="ver" value={ver} />
            <input type="hidden" name="mes" value={mes} />
            <input type="search" name="q" defaultValue={q} placeholder="Buscar NCF, cliente o RNC" className="campo w-56" aria-label="Buscar" />
          </form>
        </div>
      </div>

      {docs.length === 0 ? (
        <div className="tarjeta p-8 text-center text-sm text-stone-500">
          {ver === "borrador" ? "No hay borradores." : `No hay documentos en ${nombreMes(mes).toLowerCase()}.`}
        </div>
      ) : (
        <div className="tarjeta overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-stone-50 text-left text-xs text-stone-500">
              <tr>
                <th className="px-4 py-2 font-medium">Número</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Cobro</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {docs.map((f) => {
                const chip = chipEstado(f.estado, f.vence, hoy, f.tipo_doc);
                const cb = cobro.get(f.id);
                const pago = cb ? chipPago(cb.estado_pago, cb.dias_vencida) : null;
                return (
                  <tr key={f.id} className="hover:bg-stone-50">
                    <td className="px-4 py-2">
                      <Link href={`/oficina/facturacion/${f.id}`} className="font-medium text-marca-800 hover:underline">
                        {numeroDocumento(f)}
                      </Link>
                      <div className="text-xs text-stone-500">
                        {NOMBRE_DOC[f.tipo_doc]}
                        {f.tipo_ncf ? ` · ${f.tipo_ncf}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      {f.razon_social ?? f.clientes?.razon_social ?? f.cliente_nombre ?? f.clientes?.nombre}
                      {(f.rnc ?? f.clientes?.rnc) && <div className="text-xs text-stone-500">RNC {f.rnc ?? f.clientes?.rnc}</div>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">{fechaSimple(f.fecha)}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${chip.clase}`}>{chip.texto}</span>
                      {f.estado === "emitida" && f.estado_ecf !== "no_aplica" && (
                        <div className="mt-0.5 text-xs text-amber-700">{TEXTO_ECF[f.estado_ecf]}</div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {pago ? (
                        <>
                          <span className={`chip ${pago.clase}`}>{pago.texto}</span>
                          {Number(cb!.saldo) > 0 && Number(cb!.saldo) < Number(f.total) && (
                            <div className="mt-0.5 text-xs text-stone-500 tabular-nums">debe {monto(cb!.saldo, f.moneda)}</div>
                          )}
                        </>
                      ) : (
                        <span className="text-stone-300">—</span>
                      )}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-2 text-right tabular-nums ${f.estado === "anulada" ? "text-stone-400 line-through" : ""}`}>
                      {f.tipo_doc === "nota_credito" ? "− " : ""}
                      {monto(f.total, f.moneda)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
