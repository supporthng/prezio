import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonImprimir } from "@/components/BotonImprimir";
import { Encabezado, Indicador } from "@/components/Encabezado";
import { BotonEnviar, Formulario } from "@/components/Formulario";
import { Icono } from "@/components/Icono";
import { chipPago, monto, montoEntero } from "@/lib/facturacion";
import { enlaceWhatsapp, fechaLarga, fechaSimple, hoyRD } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import type { ClienteCuenta, Empresa, FacturaCobro } from "@/lib/tipos";
import { devolverSaldo } from "../../acciones";

export const metadata: Metadata = { title: "Estado de cuenta" };

type Mov = { fecha: string; orden: string; tipo: string; numero: string; href: string; cargo: number; abono: number };

export default async function EstadoCuenta({ params }: PageProps<"/oficina/cobros/cliente/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const hoy = hoyRD();
  const supabase = await supabaseServidor();
  const [{ data: cuenta }, { data: pend }, { data: docs }, { data: cobros }, { data: favor }, { data: emp }] = await Promise.all([
    supabase.from("clientes_cuenta").select("*").eq("id", id).maybeSingle(),
    supabase.from("facturas_cobro").select("*").eq("cliente_id", id).gt("saldo", 0).order("fecha"),
    supabase.from("facturas").select("id, tipo_doc, ncf, fecha, total, nc_aplicada, emitida_en, tasa_cambio").eq("cliente_id", id).eq("estado", "emitida").in("tipo_doc", ["factura", "nota_credito"]).order("fecha").limit(500),
    supabase.from("cobros").select("id, numero, fecha, total, creado_en, tasa_cambio, cobro_aplicaciones(monto, facturas(tasa_cambio))").eq("cliente_id", id).eq("estado", "activo").order("fecha").limit(500),
    supabase.from("movimientos_saldo").select("fecha, monto, concepto").eq("cliente_id", id).order("fecha", { ascending: false }).limit(50),
    supabase.from("empresa").select("*").eq("id", 1).maybeSingle(),
  ]);
  if (!cuenta) notFound();
  const c = cuenta as ClienteCuenta;
  const e = emp as Empresa | null;
  const pendientes = (pend ?? []) as FacturaCobro[];
  const vencido = pendientes.filter((f) => f.vence && f.vence < hoy).reduce((s, f) => s + Number(f.saldo_dop), 0);
  const limite = c.limite_credito !== null ? Number(c.limite_credito) : null;

  const movs: Mov[] = [];
  for (const d of docs ?? []) {
    if (d.tipo_doc === "factura")
      movs.push({ fecha: d.fecha, orden: d.emitida_en ?? d.fecha, tipo: "Factura", numero: d.ncf, href: `/oficina/facturacion/${d.id}`, cargo: Number(d.total) * Number(d.tasa_cambio ?? 1), abono: 0 });
    else if (Number(d.nc_aplicada) > 0)
      movs.push({ fecha: d.fecha, orden: d.emitida_en ?? d.fecha, tipo: "Nota de crédito", numero: d.ncf, href: `/oficina/facturacion/${d.id}`, cargo: 0, abono: Number(d.nc_aplicada) * Number(d.tasa_cambio ?? 1) });
  }
  for (const k of (cobros ?? []) as unknown as { id: string; numero: string; fecha: string; creado_en: string; cobro_aplicaciones: { monto: number; facturas: { tasa_cambio: number } | null }[] }[]) {
    // Se rebaja en pesos con la tasa de la factura (la diferencia cambiaria no cambia la deuda)
    const aplicado = k.cobro_aplicaciones.reduce((s, a) => s + Number(a.monto) * Number(a.facturas?.tasa_cambio ?? 1), 0);
    if (aplicado > 0) movs.push({ fecha: k.fecha, orden: k.creado_en, tipo: "Cobro", numero: k.numero, href: `/oficina/cobros/${k.id}`, cargo: 0, abono: aplicado });
  }
  movs.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden.localeCompare(b.orden));
  let corrido = 0;
  const historial = movs.map((m) => ({ ...m, balance: (corrido = Math.round((corrido + m.cargo - m.abono) * 100) / 100) }));

  const mensaje = [
    `Hola, le compartimos su estado de cuenta con ${e?.nombre ?? "nosotros"} al ${fechaSimple(hoy)}:`,
    ...pendientes.map((f) => `• ${f.ncf} del ${fechaSimple(f.fecha)}: ${monto(f.saldo, f.moneda)}${f.vence && f.vence < hoy ? " (vencida)" : ""}`),
    `Total pendiente: ${monto(c.pendiente)}`,
  ].join("\n");
  const wa = enlaceWhatsapp(c.telefono, mensaje);

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <Encabezado
          titulo={c.nombre}
          detalle={[c.razon_social && c.razon_social !== c.nombre && c.razon_social, c.rnc && `RNC ${c.rnc}`, c.dias_credito ? `Crédito ${c.dias_credito} días` : "Contado"].filter(Boolean).join(" · ")}
          volver={{ href: "/oficina/cobros", texto: "Cuentas por cobrar" }}
          acciones={
            <>
              <BotonImprimir />
              {wa && pendientes.length > 0 && (
                <a href={wa} target="_blank" rel="noopener noreferrer" className="boton-sec">
                  <Icono nombre="whatsapp" tam={16} /> Enviar por WhatsApp
                </a>
              )}
              <Link href={`/oficina/clientes/${c.id}`} className="boton-sec">Ficha del cliente</Link>
              <Link href={`/oficina/cobros/nuevo?cliente=${c.id}`} className="boton">
                <Icono nombre="cobros" tam={16} /> Registrar cobro
              </Link>
            </>
          }
        />
      </div>

      <div className="hidden print:block">
        <h1 className="font-display text-xl font-semibold">{e?.nombre}</h1>
        <p className="text-sm">Estado de cuenta de <b>{c.razon_social || c.nombre}</b>{c.rnc ? ` · RNC ${c.rnc}` : ""} · {fechaLarga(hoy)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Indicador titulo="Debe" valor={montoEntero(c.pendiente)} detalle={`${c.facturas_pendientes} factura${c.facturas_pendientes === 1 ? "" : "s"}`} tono="oscuro" />
        <Indicador titulo="Vencido" valor={montoEntero(vencido)} detalle={c.max_dias_vencida ? `La más vieja: ${c.max_dias_vencida} días` : "Al día"} tono={vencido ? "peligro" : "normal"} />
        <Indicador titulo="Saldo a favor" valor={montoEntero(c.saldo_favor)} detalle="Anticipos y notas de crédito" />
        <Indicador
          titulo="Crédito disponible"
          valor={limite === null ? "Sin límite" : montoEntero(Math.max(limite - Number(c.pendiente), 0))}
          detalle={limite === null ? "Ponle un límite en su ficha" : `Límite ${montoEntero(limite)}`}
          tono={limite !== null && Number(c.pendiente) > limite ? "peligro" : "normal"}
        />
      </div>

      <section className="tarjeta overflow-x-auto">
        <h2 className="subtitulo p-5 pb-2">Facturas pendientes</h2>
        {pendientes.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-stone-500">No tiene facturas pendientes.</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-stone-500">
              <tr>
                <th className="px-5 py-2 font-semibold">Factura</th>
                <th className="px-2 py-2 font-semibold">Fecha</th>
                <th className="px-2 py-2 font-semibold">Vence</th>
                <th className="px-2 py-2 text-right font-semibold">Total</th>
                <th className="px-5 py-2 text-right font-semibold">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 tabular-nums">
              {pendientes.map((f) => {
                const chip = chipPago(f.estado_pago, f.dias_vencida);
                return (
                  <tr key={f.id}>
                    <td className="px-5 py-2.5"><Link href={`/oficina/facturacion/${f.id}`} className="font-mono text-[13px] font-bold hover:underline">{f.ncf}</Link></td>
                    <td className="px-2 py-2.5">{fechaSimple(f.fecha)}</td>
                    <td className="px-2 py-2.5">{f.vence ? fechaSimple(f.vence) : "—"} <span className={`chip ml-1 ${chip.clase} print:hidden`}>{chip.texto}</span></td>
                    <td className="px-2 py-2.5 text-right">{monto(f.total, f.moneda)}</td>
                    <td className="px-5 py-2.5 text-right font-bold">{monto(f.saldo, f.moneda)}</td>
                  </tr>
                );
              })}
              <tr className="bg-stone-50">
                <td colSpan={4} className="px-5 py-2.5 text-right font-bold">Total pendiente{pendientes.some((f) => f.moneda !== "DOP") ? " (en pesos)" : ""}</td>
                <td className="px-5 py-2.5 text-right font-display font-semibold">{monto(c.pendiente)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <section className="tarjeta overflow-x-auto">
          <h2 className="subtitulo p-5 pb-2">Movimientos</h2>
          {historial.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-stone-500">Sin movimientos.</p>
          ) : (
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="px-5 py-2 font-semibold">Fecha</th>
                  <th className="px-2 py-2 font-semibold">Documento</th>
                  <th className="px-2 py-2 text-right font-semibold">Cargo</th>
                  <th className="px-2 py-2 text-right font-semibold">Abono</th>
                  <th className="px-5 py-2 text-right font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 tabular-nums">
                {historial.slice(-60).map((m, i) => (
                  <tr key={i}>
                    <td className="px-5 py-2">{fechaSimple(m.fecha)}</td>
                    <td className="px-2 py-2">
                      <Link href={m.href} className="hover:underline">{m.tipo} <span className="font-mono text-[13px]">{m.numero}</span></Link>
                    </td>
                    <td className="px-2 py-2 text-right">{m.cargo ? monto(m.cargo) : ""}</td>
                    <td className="px-2 py-2 text-right text-marca-700">{m.abono ? monto(m.abono) : ""}</td>
                    <td className="px-5 py-2 text-right font-semibold">{monto(m.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="tarjeta space-y-3 p-5 print:hidden">
          <h2 className="subtitulo">Saldo a favor: {monto(c.saldo_favor)}</h2>
          {(favor ?? []).length === 0 ? (
            <p className="text-sm text-stone-500">Sin movimientos de saldo a favor.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {(favor ?? []).map((m, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">{m.concepto} <span className="text-xs text-stone-500">· {fechaSimple(String(m.fecha).slice(0, 10))}</span></span>
                  <span className={`shrink-0 tabular-nums ${Number(m.monto) > 0 ? "text-marca-700" : "text-stone-600"}`}>
                    {Number(m.monto) > 0 ? "+" : "−"} {monto(Math.abs(Number(m.monto)))}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {Number(c.saldo_favor) > 0 && (
            <details className="rounded-xl bg-stone-50 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-marca-700">Devolver saldo al cliente</summary>
              <Formulario accion={devolverSaldo} className="mt-3 space-y-2" limpiar>
                <input type="hidden" name="cliente" value={c.id} />
                <div className="grid grid-cols-2 gap-2">
                  <input name="monto" className="campo" inputMode="decimal" placeholder="Monto" aria-label="Monto a devolver" required defaultValue={Number(c.saldo_favor).toFixed(2)} />
                  <select name="forma" className="campo" aria-label="Cómo se devuelve">
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <input name="nota" className="campo" placeholder="Nota (opcional)" aria-label="Nota" />
                <BotonEnviar className="boton boton-chico" pendiente="Guardando…">Registrar devolución</BotonEnviar>
              </Formulario>
            </details>
          )}
        </section>
      </div>
    </div>
  );
}
