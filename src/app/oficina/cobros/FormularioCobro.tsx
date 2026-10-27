"use client";

import { useMemo, useState } from "react";
import { BotonEnviar, Formulario } from "@/components/Formulario";
import { Icono } from "@/components/Icono";
import { chipPago, FORMAS_PAGO, MONEDAS, monto } from "@/lib/facturacion";
import { fechaSimple } from "@/lib/formato";
import type { FacturaCobro, FormaPago } from "@/lib/tipos";
import { registrarCobro } from "./acciones";

export type ClienteCobro = { id: string; nombre: string; rnc: string | null; saldo_favor: number; pendiente: number };

type Pago = { clave: number; forma: FormaPago; monto: string; referencia: string };

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (t: string) => Number(String(t).replace(/,/g, "")) || 0;

/** Reparte el pago empezando por la factura más vieja */
function repartir(facturas: FacturaCobro[], disponible: number) {
  const a: Record<string, string> = {};
  let queda = disponible;
  for (const f of [...facturas].sort((x, y) => (x.vence ?? x.fecha).localeCompare(y.vence ?? y.fecha))) {
    const m = r2(Math.min(queda, Number(f.saldo)));
    a[f.id] = m > 0 ? String(m) : "";
    queda = r2(queda - Math.max(m, 0));
  }
  return a;
}

let n = 0;

export function FormularioCobro({
  clientes,
  facturas,
  inicialCliente,
  inicialFactura,
  hoy,
}: {
  clientes: ClienteCobro[];
  facturas: FacturaCobro[];
  inicialCliente: string;
  inicialFactura: string | null;
  hoy: string;
}) {
  const [clienteId, setClienteId] = useState(inicialCliente);
  const [buscar, setBuscar] = useState("");
  const monedaInicial = (id: string) => {
    const f = inicialFactura ? facturas.find((x) => x.id === inicialFactura) : facturas.find((x) => x.cliente_id === id);
    return f?.moneda ?? "DOP";
  };
  const [moneda, setMoneda] = useState<string>(() => monedaInicial(inicialCliente));
  const [tasa, setTasa] = useState("");
  const todasDelCliente = useMemo(() => facturas.filter((f) => f.cliente_id === clienteId), [facturas, clienteId]);
  const monedasCliente = [...new Set(["DOP", ...todasDelCliente.map((f) => f.moneda)])];
  const delCliente = useMemo(() => todasDelCliente.filter((f) => f.moneda === moneda), [todasDelCliente, moneda]);
  const sugerido = (lista: FacturaCobro[]) => {
    const f = inicialFactura ? lista.find((x) => x.id === inicialFactura) : null;
    return r2(f ? Number(f.saldo) : lista.reduce((s, x) => s + Number(x.saldo), 0));
  };
  const [pagos, setPagos] = useState<Pago[]>(() => [
    { clave: ++n, forma: "efectivo", monto: inicialCliente ? String(sugerido(delCliente) || "") : "", referencia: "" },
  ]);
  const [aplic, setAplic] = useState<Record<string, string>>(() =>
    inicialFactura ? { [inicialFactura]: String(sugerido(delCliente)) } : repartir(delCliente, sugerido(delCliente)),
  );
  const [fecha, setFecha] = useState(hoy);
  const [notas, setNotas] = useState("");

  const cliente = clientes.find((c) => c.id === clienteId);
  const totalPagos = r2(pagos.reduce((s, p) => s + num(p.monto), 0));
  const totalAplicado = r2(Object.values(aplic).reduce((s, v) => s + num(v), 0));
  const deuda = r2(delCliente.reduce((s, f) => s + Number(f.saldo), 0));
  const aFavor = r2(totalPagos - totalAplicado);
  const usaFavor = r2(pagos.filter((p) => p.forma === "saldo_favor").reduce((s, p) => s + num(p.monto), 0));

  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return q ? clientes.filter((c) => c.nombre.toLowerCase().includes(q) || c.rnc?.includes(q) || c.id === clienteId) : clientes;
  }, [buscar, clientes, clienteId]);

  function cambiarMoneda(m: string) {
    setMoneda(m);
    setTasa("");
    const lista = todasDelCliente.filter((f) => f.moneda === m);
    const total = r2(lista.reduce((s, f) => s + Number(f.saldo), 0));
    setPagos([{ clave: ++n, forma: m === "DOP" ? "efectivo" : "transferencia", monto: total ? String(total) : "", referencia: "" }]);
    setAplic(repartir(lista, total));
  }

  function elegir(id: string) {
    setClienteId(id);
    const m = facturas.find((f) => f.cliente_id === id)?.moneda ?? "DOP";
    setMoneda(m);
    setTasa("");
    const lista = facturas.filter((f) => f.cliente_id === id && f.moneda === m);
    const total = r2(lista.reduce((s, f) => s + Number(f.saldo), 0));
    setPagos([{ clave: ++n, forma: "efectivo", monto: total ? String(total) : "", referencia: "" }]);
    setAplic(repartir(lista, total));
  }

  function cambiarPago(clave: number, campo: keyof Pago, valor: string) {
    const nuevos = pagos.map((p) => (p.clave === clave ? { ...p, [campo]: valor } : p));
    setPagos(nuevos);
    if (campo === "monto") setAplic(repartir(delCliente, Math.min(r2(nuevos.reduce((s, p) => s + num(p.monto), 0)), deuda)));
  }

  const datos = JSON.stringify({
    cliente_id: clienteId,
    moneda,
    tasa_cambio: moneda === "DOP" ? 1 : Number(tasa) || null,
    fecha,
    notas,
    pagos: pagos.filter((p) => num(p.monto) > 0).map((p) => ({ forma: p.forma, monto: num(p.monto), referencia: p.referencia || null })),
    aplicaciones: Object.entries(aplic).filter(([, v]) => num(v) > 0).map(([factura_id, v]) => ({ factura_id, monto: num(v) })),
  });

  const error =
    moneda !== "DOP" && !(Number(tasa) > 0)
      ? "Indica la tasa de cambio del día del cobro."
      : moneda !== "DOP" && aFavor > 0
        ? "En otra moneda el cobro debe aplicarse completo a facturas."
      : totalAplicado > totalPagos
      ? "Estás aplicando más de lo que se recibió."
      : cliente && usaFavor > cliente.saldo_favor
        ? `El cliente solo tiene ${monto(cliente.saldo_favor)} a favor.`
        : null;

  return (
    <Formulario accion={registrarCobro} className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <input type="hidden" name="datos" value={datos} />
      <div className="min-w-0 space-y-5">
        <section className="tarjeta space-y-3 p-5">
          <h2 className="subtitulo">Cliente</h2>
          <div className="flex flex-wrap gap-2">
            <input type="search" className="campo sm:w-56" placeholder="Buscar nombre o RNC" value={buscar} onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar cliente" />
            <select className="campo min-w-0 flex-1" value={clienteId} onChange={(e) => elegir(e.target.value)} aria-label="Cliente">
              <option value="">Elige el cliente…</option>
              {filtrados.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {c.pendiente > 0 ? ` · debe ${monto(c.pendiente)}` : ""}
                </option>
              ))}
            </select>
          </div>
          {cliente && (
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="chip bg-amber-50 text-amber-800">Debe {monto(deuda, moneda)}</span>
              {cliente.saldo_favor > 0 && <span className="chip bg-marca-50 text-marca-700">A favor {monto(cliente.saldo_favor)}</span>}
            </div>
          )}
          {cliente && monedasCliente.length > 1 && (
            <div className="flex flex-wrap items-end gap-3 rounded-xl bg-stone-50 p-3">
              <div>
                <label className="etiqueta" htmlFor="moneda-cobro">Moneda del cobro</label>
                <select id="moneda-cobro" className="campo" value={moneda} onChange={(e) => cambiarMoneda(e.target.value)}>
                  {monedasCliente.map((m) => (
                    <option key={m} value={m}>{MONEDAS.find((x) => x.valor === m)?.simbolo} · {MONEDAS.find((x) => x.valor === m)?.texto}</option>
                  ))}
                </select>
              </div>
              <p className="pb-2 text-xs text-stone-500">Este cliente tiene facturas en varias monedas. Cada cobro es en una sola.</p>
            </div>
          )}
          {moneda !== "DOP" && (
            <div className="max-w-xs">
              <label className="etiqueta" htmlFor="tasa-cobro">Tasa del día (RD$ por 1 {moneda})</label>
              <input id="tasa-cobro" className="campo" inputMode="decimal" value={tasa} onChange={(e) => setTasa(e.target.value)} placeholder="Ej. 60.40" />
            </div>
          )}
        </section>

        <section className="tarjeta space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="subtitulo">¿Cómo pagó?</h2>
            <button
              type="button"
              className="boton-sec boton-chico"
              onClick={() => setPagos((ps) => [...ps, { clave: ++n, forma: "transferencia", monto: "", referencia: "" }])}
            >
              <Icono nombre="mas" tam={14} /> Otra forma de pago
            </button>
          </div>
          {pagos.map((p, i) => {
            const f = FORMAS_PAGO.find((x) => x.valor === p.forma);
            return (
              <div key={p.clave} className="grid gap-2 rounded-xl bg-stone-50 p-3 sm:grid-cols-[180px_160px_1fr_auto]">
                <select
                  className="campo"
                  value={p.forma}
                  onChange={(e) => cambiarPago(p.clave, "forma", e.target.value)}
                  aria-label={`Forma de pago ${i + 1}`}
                >
                  {FORMAS_PAGO.filter((x) => x.valor !== "saldo_favor" || (moneda === "DOP" && (cliente?.saldo_favor ?? 0) > 0)).map((x) => (
                    <option key={x.valor} value={x.valor}>{x.texto}</option>
                  ))}
                </select>
                <input
                  className="campo text-right tabular-nums"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={p.monto}
                  onChange={(e) => cambiarPago(p.clave, "monto", e.target.value)}
                  aria-label={`Monto ${i + 1}`}
                />
                <input
                  className="campo"
                  placeholder={f?.referencia ?? "Referencia (opcional)"}
                  value={p.referencia}
                  disabled={!f?.referencia}
                  onChange={(e) => cambiarPago(p.clave, "referencia", e.target.value)}
                  aria-label={`Referencia ${i + 1}`}
                />
                <button
                  type="button"
                  className="rounded-lg p-2 text-stone-400 hover:bg-red-50 hover:text-red-700 disabled:invisible"
                  disabled={pagos.length === 1}
                  onClick={() => setPagos((ps) => ps.filter((x) => x.clave !== p.clave))}
                  aria-label={`Quitar forma de pago ${i + 1}`}
                >
                  <Icono nombre="cerrar" tam={16} />
                </button>
              </div>
            );
          })}
        </section>

        <section className="tarjeta overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-3">
            <h2 className="subtitulo">Facturas que paga</h2>
            {delCliente.length > 0 && (
              <button type="button" className="text-[13px] font-semibold text-marca-600 hover:underline" onClick={() => setAplic(repartir(delCliente, Math.min(totalPagos, deuda)))}>
                Repartir automático
              </button>
            )}
          </div>
          {!cliente ? (
            <p className="px-5 pb-5 text-sm text-stone-500">Elige el cliente para ver lo que debe.</p>
          ) : delCliente.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-stone-500">Este cliente no debe nada. Lo que pague quedará como saldo a favor (anticipo).</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-stone-50 text-left text-xs text-stone-500">
                  <tr>
                    <th className="px-5 py-2 font-semibold">Factura</th>
                    <th className="px-2 py-2 font-semibold">Vence</th>
                    <th className="px-2 py-2 text-right font-semibold">Saldo</th>
                    <th className="w-40 px-5 py-2 text-right font-semibold">Aplicar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {delCliente.map((f) => {
                    const chip = chipPago(f.estado_pago, f.dias_vencida);
                    return (
                      <tr key={f.id}>
                        <td className="px-5 py-2.5">
                          <b className="font-mono text-[13px]">{f.ncf}</b>
                          <div className="text-xs text-stone-500">{fechaSimple(f.fecha)} · total {monto(f.total, moneda)}</div>
                        </td>
                        <td className="px-2 py-2.5">
                          {f.vence ? fechaSimple(f.vence) : "—"} <span className={`chip ml-1 ${chip.clase}`}>{chip.texto}</span>
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{monto(f.saldo, moneda)}</td>
                        <td className="px-5 py-2.5">
                          <input
                            className="campo text-right tabular-nums"
                            inputMode="decimal"
                            value={aplic[f.id] ?? ""}
                            placeholder="0.00"
                            onChange={(e) => setAplic((a) => ({ ...a, [f.id]: e.target.value }))}
                            aria-label={`Aplicar a ${f.ncf}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div className="tarjeta space-y-3 p-5 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="etiqueta" htmlFor="fecha-cobro">Fecha</label>
              <input id="fecha-cobro" type="date" className="campo" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <label className="etiqueta" htmlFor="notas-cobro">Nota</label>
              <input id="notas-cobro" className="campo" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 border-t border-stone-100 pt-3 tabular-nums">
            <dt className="text-stone-500">Recibido</dt>
            <dd className="text-right font-semibold">{monto(totalPagos, moneda)}</dd>
            <dt className="text-stone-500">Aplicado a facturas</dt>
            <dd className="text-right">{monto(totalAplicado, moneda)}</dd>
            {aFavor > 0 && (
              <>
                <dt className="text-marca-700">Queda a favor</dt>
                <dd className="text-right font-semibold text-marca-700">{monto(aFavor, moneda)}</dd>
              </>
            )}
            <dt className="border-t border-stone-200 pt-2 text-stone-500">Seguirá debiendo</dt>
            <dd className="border-t border-stone-200 pt-2 text-right font-display text-lg font-semibold">{monto(Math.max(r2(deuda - totalAplicado), 0), moneda)}</dd>
          </dl>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        </div>
        <BotonEnviar className="boton h-12 w-full text-base" pendiente="Registrando…">
          <Icono nombre="check" /> Registrar cobro
        </BotonEnviar>
      </aside>
    </Formulario>
  );
}
