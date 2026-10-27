import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonImprimir } from "@/components/BotonImprimir";
import { Encabezado } from "@/components/Encabezado";
import { Icono } from "@/components/Icono";
import { monto, TEXTO_FORMA } from "@/lib/facturacion";
import { fechaLarga, fechaSimple } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Cobro, Empresa, FormaPago } from "@/lib/tipos";
import { AnularCobro } from "./AnularCobro";

export const metadata: Metadata = { title: "Recibo de ingreso" };

export default async function Recibo({ params, searchParams }: PageProps<"/oficina/cobros/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const supabase = await supabaseServidor();
  const [{ data }, { data: pagos }, { data: aplic }, { data: emp }, { data: favor }] = await Promise.all([
    supabase.from("cobros").select("*, clientes(id, nombre, razon_social, rnc)").eq("id", id).maybeSingle(),
    supabase.from("cobro_pagos").select("forma, monto, referencia").eq("cobro_id", id),
    supabase.from("cobro_aplicaciones").select("monto, facturas(id, ncf, fecha, total)").eq("cobro_id", id),
    supabase.from("empresa").select("*").eq("id", 1).maybeSingle(),
    supabase.from("movimientos_saldo").select("monto, concepto").eq("cobro_id", id),
  ]);
  if (!data) notFound();
  const k = data as Cobro & { clientes: { id: string; nombre: string; razon_social: string | null; rnc: string | null } };
  const e = emp as Empresa | null;
  const lineas = (aplic ?? []) as unknown as { monto: number; facturas: { id: string; ncf: string; fecha: string; total: number } }[];
  const movs = (favor ?? []) as { monto: number; concepto: string }[];
  const anticipo = movs.filter((m) => Number(m.monto) > 0 && m.concepto.startsWith("Anticipo")).reduce((s, m) => s + Number(m.monto), 0);
  const usado = -movs.filter((m) => Number(m.monto) < 0 && m.concepto.startsWith("Usado")).reduce((s, m) => s + Number(m.monto), 0);

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <Encabezado
          titulo={`Recibo ${k.numero}`}
          insignia={k.estado === "anulado" ? <span className="chip bg-red-50 text-red-700">Anulado</span> : <span className="chip bg-marca-50 text-marca-700">Activo</span>}
          volver={{ href: "/oficina/cobros?ver=recibos", texto: "Recibos" }}
          acciones={
            <>
              <BotonImprimir />
              <Link href={`/oficina/cobros/cliente/${k.clientes.id}`} className="boton-sec">Estado de cuenta</Link>
              {k.estado === "activo" && <AnularCobro id={k.id} numero={k.numero} />}
            </>
          }
        />
        {sp.nuevo && k.estado === "activo" && (
          <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-marca-50 px-4 py-3 text-sm font-semibold text-marca-800">
            <Icono nombre="check" /> Cobro registrado.
          </p>
        )}
        {k.estado === "anulado" && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">Anulado: {k.motivo_anulacion}</p>}
      </div>

      <article className="tarjeta mx-auto max-w-3xl overflow-hidden print:max-w-none print:border-0 print:shadow-none">
        <div className="h-1.5 bg-marca-600" />
        <div className="space-y-6 p-6 sm:p-10">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-5">
            <div>
              <h2 className="font-display text-xl font-semibold text-marca-700">{e?.nombre}</h2>
              <p className="text-xs text-stone-500">{[e?.rnc && `RNC ${e.rnc}`, e?.telefono && `Tel. ${e.telefono}`].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold tracking-wide text-stone-500 uppercase">Recibo de ingreso</p>
              <p className="font-mono text-lg font-bold">{k.numero}</p>
              <p className="text-xs text-stone-500">{fechaLarga(k.fecha)}</p>
            </div>
          </header>

          <p className="text-sm">
            Recibimos de <b>{k.clientes.razon_social || k.clientes.nombre}</b>
            {k.clientes.rnc ? ` (RNC ${k.clientes.rnc})` : ""} la suma de{" "}
            <b className="font-display text-base">{monto(k.total, k.moneda)}</b>.
          </p>

          <div className="grid gap-6 sm:grid-cols-2">
            <section>
              <h3 className="mb-2 text-xs font-bold tracking-wide text-marca-600 uppercase">Forma de pago</h3>
              <ul className="space-y-1 text-sm">
                {((pagos ?? []) as { forma: FormaPago; monto: number; referencia: string | null }[]).map((p, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span>
                      {TEXTO_FORMA[p.forma]}
                      {p.referencia && <span className="text-stone-500"> · {p.referencia}</span>}
                    </span>
                    <span className="tabular-nums">{monto(p.monto, k.moneda)}</span>
                  </li>
                ))}
                {Number(k.cambio) > 0 && (
                  <li className="flex justify-between gap-3 text-stone-500">
                    <span>Cambio devuelto</span>
                    <span className="tabular-nums">− {monto(k.cambio, k.moneda)}</span>
                  </li>
                )}
              </ul>
            </section>
            <section>
              <h3 className="mb-2 text-xs font-bold tracking-wide text-marca-600 uppercase">Aplicado a</h3>
              {lineas.length === 0 ? (
                <p className="text-sm text-stone-500">Anticipo (saldo a favor)</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {lineas.map((l) => (
                    <li key={l.facturas.id} className="flex justify-between gap-3">
                      <Link href={`/oficina/facturacion/${l.facturas.id}`} className="font-mono text-[13px] hover:underline">
                        {l.facturas.ncf} <span className="font-sans text-xs text-stone-500">· {fechaSimple(l.facturas.fecha)}</span>
                      </Link>
                      <span className="tabular-nums">{monto(l.monto, k.moneda)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {anticipo > 0 && lineas.length > 0 && <p className="mt-2 text-sm text-marca-700">Queda a favor del cliente: {monto(anticipo)}</p>}
              {usado > 0 && <p className="mt-2 text-sm text-stone-600">Se usó saldo a favor: {monto(usado)}</p>}
            </section>
          </div>

          {k.moneda && k.moneda !== "DOP" && (
            <p className="text-xs text-stone-500">Cobro en {k.moneda} a una tasa de {Number(k.tasa_cambio)} · equivale a {monto(Number(k.total) * Number(k.tasa_cambio))}</p>
          )}
          {k.notas && <p className="text-sm text-stone-600">{k.notas}</p>}

          <div className="grid gap-10 pt-10 sm:grid-cols-2">
            <div className="border-t border-stone-400 pt-2 text-center text-xs text-stone-500">Recibido por</div>
            <div className="border-t border-stone-400 pt-2 text-center text-xs text-stone-500">Entregado por</div>
          </div>
        </div>
      </article>
    </div>
  );
}
