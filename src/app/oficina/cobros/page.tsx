import type { Metadata } from "next";
import Link from "next/link";
import { Encabezado, Indicador } from "@/components/Encabezado";
import { Icono } from "@/components/Icono";
import { chipPago, monto, montoEntero, TEXTO_FORMA } from "@/lib/facturacion";
import { fechaSimple, hoyRD } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import type { ClienteCuenta, Cobro, FacturaCobro, FormaPago } from "@/lib/tipos";

export const metadata: Metadata = { title: "Cuentas por cobrar" };

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function siguienteMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);
}

const VISTAS = [
  { valor: "clientes", texto: "Por cliente" },
  { valor: "facturas", texto: "Facturas pendientes" },
  { valor: "vencidas", texto: "Vencidas" },
  { valor: "recibos", texto: "Recibos" },
];

export default async function Cobros({ searchParams }: PageProps<"/oficina/cobros">) {
  const sp = await searchParams;
  const ver = uno(sp.ver) ?? "clientes";
  const q = (uno(sp.q) ?? "").trim().toLowerCase();
  const hoy = hoyRD();
  const mes = uno(sp.mes) && /^\d{4}-\d{2}$/.test(uno(sp.mes)!) ? uno(sp.mes)! : hoy.slice(0, 7);
  const supabase = await supabaseServidor();

  const [{ data: cuentasData }, { data: facturasData }, { data: recibosData }] = await Promise.all([
    supabase.from("clientes_cuenta").select("*").or("pendiente.gt.0,saldo_favor.gt.0").order("pendiente", { ascending: false }).limit(2000),
    ver === "facturas" || ver === "vencidas"
      ? supabase.from("facturas_cobro").select("*").gt("saldo", 0).order("vence", { nullsFirst: true }).limit(2000)
      : Promise.resolve({ data: [] }),
    ver === "recibos"
      ? supabase
          .from("cobros")
          .select("*, clientes(nombre), cobro_pagos(forma, monto)")
          .gte("fecha", `${mes}-01`)
          .lt("fecha", siguienteMes(mes))
          .order("creado_en", { ascending: false })
          .limit(1000)
      : Promise.resolve({ data: [] }),
  ]);

  const cuentas = (cuentasData ?? []) as ClienteCuenta[];
  const tot = (k: keyof ClienteCuenta) => cuentas.reduce((s, c) => s + Number(c[k] ?? 0), 0);
  const pendiente = tot("pendiente");
  const deudores = cuentas.filter((c) => Number(c.pendiente) > 0);

  const filtra = <T,>(lista: T[], campos: (x: T) => (string | null | undefined)[]) =>
    q ? lista.filter((x) => campos(x).some((v) => v?.toLowerCase().includes(q))) : lista;

  let facturas = (facturasData ?? []) as FacturaCobro[];
  if (ver === "vencidas") facturas = facturas.filter((f) => f.vence && f.vence < hoy);
  facturas = filtra(facturas, (f) => [f.cliente, f.ncf, f.rnc]);
  type Recibo = Cobro & { clientes: { nombre: string } | null; cobro_pagos: { forma: FormaPago; monto: number }[] };
  const recibos = filtra((recibosData ?? []) as Recibo[], (r) => [r.numero, r.clientes?.nombre]);
  const listaClientes = filtra(cuentas, (c) => [c.nombre, c.razon_social, c.rnc]);

  const tramos = [
    { titulo: "Por vencer", valor: tot("por_vencer"), tono: "normal" as const },
    { titulo: "1 a 30 días", valor: tot("d1_30"), tono: "alerta" as const },
    { titulo: "31 a 60 días", valor: tot("d31_60"), tono: "alerta" as const },
    { titulo: "61 a 90 días", valor: tot("d61_90"), tono: "peligro" as const },
    { titulo: "Más de 90 días", valor: tot("d90"), tono: "peligro" as const },
  ];

  return (
    <div className="space-y-5">
      <Encabezado
        titulo="Cuentas por cobrar"
        detalle={`${montoEntero(pendiente)} pendiente de ${deudores.length} cliente${deudores.length === 1 ? "" : "s"}${tot("saldo_favor") > 0 ? ` · ${montoEntero(tot("saldo_favor"))} en saldos a favor` : ""}`}
        acciones={
          <Link href="/oficina/cobros/nuevo" className="boton">
            <Icono nombre="mas" tam={16} /> Registrar cobro
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {tramos.map((t) => (
          <Indicador key={t.titulo} titulo={t.titulo} valor={montoEntero(t.valor)} tono={t.valor > 0 ? t.tono : "normal"} />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-2" aria-label="Vista">
          {VISTAS.map((v) => (
            <Link key={v.valor} href={`/oficina/cobros?ver=${v.valor}`} className={`pestana ${ver === v.valor ? "pestana-activa" : "bg-white text-stone-700"}`}>
              {v.texto}
            </Link>
          ))}
        </nav>
        <form className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="ver" value={ver} />
          {ver === "recibos" && <input type="month" name="mes" defaultValue={mes} className="campo w-44" aria-label="Mes" />}
          <div className="relative">
            <Icono nombre="buscar" tam={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
            <input type="search" name="q" defaultValue={q} placeholder="Buscar cliente, RNC o número" className="campo w-64 pl-9" aria-label="Buscar" />
          </div>
        </form>
      </div>

      {ver === "clientes" && (
        <div className="tarjeta overflow-x-auto">
          {listaClientes.length === 0 ? (
            <p className="p-10 text-center text-sm text-stone-500">Nadie debe nada.</p>
          ) : (
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Cliente</th>
                  <th className="px-2 py-3 text-right font-semibold">Por vencer</th>
                  <th className="px-2 py-3 text-right font-semibold">1–30</th>
                  <th className="px-2 py-3 text-right font-semibold">31–60</th>
                  <th className="px-2 py-3 text-right font-semibold">61–90</th>
                  <th className="px-2 py-3 text-right font-semibold">+90</th>
                  <th className="px-2 py-3 text-right font-semibold">Total</th>
                  <th className="px-5 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 tabular-nums">
                {listaClientes.map((c) => {
                  const limite = c.limite_credito !== null && c.limite_credito !== undefined ? Number(c.limite_credito) : null;
                  const pasado = limite !== null && Number(c.pendiente) > limite;
                  const cero = (v: number) => (Number(v) ? monto(v) : <span className="text-stone-300">—</span>);
                  return (
                    <tr key={c.id} className="hover:bg-stone-50">
                      <td className="px-5 py-3">
                        <Link href={`/oficina/cobros/cliente/${c.id}`} className="font-bold hover:text-marca-600">{c.nombre}</Link>
                        <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-stone-500">
                          <span>{c.facturas_pendientes} factura{c.facturas_pendientes === 1 ? "" : "s"}</span>
                          {c.dias_credito > 0 && <span>· crédito {c.dias_credito} días</span>}
                          {limite !== null && <span className={pasado ? "font-bold text-orange-700" : ""}>· límite {montoEntero(limite)}</span>}
                          {Number(c.saldo_favor) > 0 && <span className="chip bg-marca-50 text-marca-700">a favor {monto(c.saldo_favor)}</span>}
                        </div>
                      </td>
                      <td className="px-2 py-3 text-right">{cero(c.por_vencer)}</td>
                      <td className="px-2 py-3 text-right text-amber-800">{cero(c.d1_30)}</td>
                      <td className="px-2 py-3 text-right text-amber-800">{cero(c.d31_60)}</td>
                      <td className="px-2 py-3 text-right text-orange-700">{cero(c.d61_90)}</td>
                      <td className="px-2 py-3 text-right font-bold text-orange-700">{cero(c.d90)}</td>
                      <td className="px-2 py-3 text-right font-extrabold">{monto(c.pendiente)}</td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {Number(c.pendiente) > 0 && (
                          <Link href={`/oficina/cobros/nuevo?cliente=${c.id}`} className="boton boton-chico">Cobrar</Link>
                        )}{" "}
                        <Link href={`/oficina/cobros/cliente/${c.id}`} className="boton-sec boton-chico">Estado de cuenta</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {(ver === "facturas" || ver === "vencidas") && (
        <div className="tarjeta overflow-x-auto">
          {facturas.length === 0 ? (
            <p className="p-10 text-center text-sm text-stone-500">{ver === "vencidas" ? "No hay facturas vencidas." : "No hay facturas pendientes."}</p>
          ) : (
            <table className="w-full min-w-[820px] text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Factura</th>
                  <th className="px-2 py-3 font-semibold">Cliente</th>
                  <th className="px-2 py-3 font-semibold">Vence</th>
                  <th className="px-2 py-3 text-right font-semibold">Total</th>
                  <th className="px-2 py-3 text-right font-semibold">Pagado</th>
                  <th className="px-2 py-3 text-right font-semibold">Saldo</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 tabular-nums">
                {facturas.map((f) => {
                  const chip = chipPago(f.estado_pago, f.dias_vencida);
                  return (
                    <tr key={f.id} className="hover:bg-stone-50">
                      <td className="px-5 py-3">
                        <Link href={`/oficina/facturacion/${f.id}`} className="font-mono text-[13px] font-bold hover:text-marca-600">{f.ncf}</Link>
                        <div className="text-xs text-stone-500">{fechaSimple(f.fecha)}</div>
                      </td>
                      <td className="px-2 py-3">{f.cliente}</td>
                      <td className="px-2 py-3 whitespace-nowrap">
                        {f.vence ? fechaSimple(f.vence) : "—"} <span className={`chip ml-1 ${chip.clase}`}>{chip.texto}</span>
                      </td>
                      <td className="px-2 py-3 text-right">{monto(f.total, f.moneda)}</td>
                      <td className="px-2 py-3 text-right text-stone-500">{monto(Number(f.cobrado) + Number(f.acreditado), f.moneda)}</td>
                      <td className="px-2 py-3 text-right font-bold">{monto(f.saldo, f.moneda)}</td>
                      <td className="px-5 py-3 text-right">
                        <Link href={`/oficina/cobros/nuevo?factura=${f.id}`} className="boton boton-chico">Cobrar</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {ver === "recibos" && (
        <div className="tarjeta overflow-x-auto">
          {recibos.length === 0 ? (
            <p className="p-10 text-center text-sm text-stone-500">No hay recibos en este mes.</p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Recibo</th>
                  <th className="px-2 py-3 font-semibold">Cliente</th>
                  <th className="px-2 py-3 font-semibold">Fecha</th>
                  <th className="px-2 py-3 font-semibold">Forma de pago</th>
                  <th className="px-5 py-3 text-right font-semibold">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {recibos.map((r) => (
                  <tr key={r.id} className="hover:bg-stone-50">
                    <td className="px-5 py-3">
                      <Link href={`/oficina/cobros/${r.id}`} className="font-mono text-[13px] font-bold hover:text-marca-600">{r.numero}</Link>
                      {r.estado === "anulado" && <span className="chip ml-2 bg-red-50 text-red-700">Anulado</span>}
                    </td>
                    <td className="px-2 py-3">{r.clientes?.nombre}</td>
                    <td className="px-2 py-3">{fechaSimple(r.fecha)}</td>
                    <td className="px-2 py-3 text-stone-600">{[...new Set(r.cobro_pagos.map((p) => TEXTO_FORMA[p.forma]))].join(" + ")}</td>
                    <td className={`px-5 py-3 text-right font-bold tabular-nums ${r.estado === "anulado" ? "text-stone-400 line-through" : ""}`}>{monto(r.total, r.moneda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
