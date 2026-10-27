"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Icono, type NombreIcono } from "@/components/Icono";
import { SelectorFacturar } from "@/components/SelectorFacturar";
import { calcularLinea, calcularTotales, FORMAS_PAGO, monto } from "@/lib/facturacion";
import { enlaceWhatsapp } from "@/lib/formato";
import type { FormaPago, Producto, Servicio, TipoComprobante } from "@/lib/tipos";
import { ventaRapida, type ResultadoVenta } from "../cobros/acciones";

export type ClientePos = {
  id: string;
  nombre: string;
  razon_social: string | null;
  rnc: string | null;
  telefono: string | null;
  tipo_comprobante: string | null;
  dias_credito: number;
  exento_itbis: boolean;
  limite_credito: number | null;
  pendiente: number;
  saldo_favor: number;
  vencidas: boolean;
};

type Item = {
  clave: string;
  descripcion: string;
  servicio_id: string | null;
  producto_id: string | null;
  cantidad: number;
  precio: number;
  descuento: number;
  itbis_tasa: number;
  existencia?: number;
};

type Pago = { forma: FormaPago; monto: string; referencia: string };

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (t: string) => Number(String(t).replace(/,/g, "")) || 0;
let sec = 0;

export function PuntoDeVenta({
  clientes,
  servicios,
  productos,
  tipos,
  bloquearCredito,
}: {
  clientes: ClientePos[];
  servicios: Servicio[];
  productos: Producto[];
  tipos: TipoComprobante[];
  bloquearCredito: boolean;
}) {
  const [vista, setVista] = useState<"todo" | "servicios" | "productos">("todo");
  const [buscar, setBuscar] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [buscarCliente, setBuscarCliente] = useState("");
  const [eligiendoCliente, setEligiendoCliente] = useState(false);
  const [tipoNcf, setTipoNcf] = useState("B02");
  const [cobrando, setCobrando] = useState(false);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [aCredito, setACredito] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecha, setHecha] = useState<NonNullable<ResultadoVenta["venta"]> | null>(null);
  const [pendiente, iniciar] = useTransition();
  const buscador = useRef<HTMLInputElement>(null);

  const cliente = clientes.find((c) => c.id === clienteId) ?? null;
  const tasa = (t: number) => (cliente?.exento_itbis ? 0 : t);

  const catalogo = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const s = servicios.map((x) => ({ tipo: "servicio" as const, id: x.id, nombre: x.nombre, precio: Number(x.precio_base), itbis: 18, existencia: undefined as number | undefined, unidad: "" }));
    const p = productos.map((x) => ({
      tipo: "producto" as const,
      id: x.id,
      nombre: x.nombre,
      precio: Number(x.precio_venta ?? 0),
      itbis: Number(x.itbis_tasa ?? 18),
      existencia: Number(x.existencia ?? 0),
      unidad: x.unidad,
    }));
    return [...(vista !== "productos" ? s : []), ...(vista !== "servicios" ? p : [])].filter((x) => !q || x.nombre.toLowerCase().includes(q));
  }, [buscar, servicios, productos, vista]);

  const totales = useMemo(() => calcularTotales(items.map((i) => ({ ...i, itbis_tasa: tasa(i.itbis_tasa) }))), [items, cliente]); // eslint-disable-line react-hooks/exhaustive-deps
  const recibido = r2(pagos.reduce((s, p) => s + num(p.monto), 0));
  const efectivo = r2(pagos.filter((p) => p.forma === "efectivo").reduce((s, p) => s + num(p.monto), 0));
  const falta = r2(Math.max(totales.total - recibido, 0));
  const cambio = r2(Math.max(recibido - totales.total, 0));
  const pasaLimite = cliente?.limite_credito !== null && cliente !== null && cliente.pendiente + totales.total > (cliente.limite_credito ?? Infinity);

  const clientesFiltrados = useMemo(() => {
    const q = buscarCliente.trim().toLowerCase();
    return (q ? clientes.filter((c) => [c.nombre, c.razon_social, c.rnc, c.telefono].some((v) => v?.toLowerCase().includes(q))) : clientes).slice(0, 40);
  }, [buscarCliente, clientes]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "F2" && items.length && !cobrando && !hecha) {
        e.preventDefault();
        abrirCobro();
      }
      if (e.key === "Escape") {
        setCobrando(false);
        setEligiendoCliente(false);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  function agregar(x: (typeof catalogo)[number]) {
    setItems((ls) => {
      const ya = ls.find((l) => (x.tipo === "servicio" ? l.servicio_id === x.id : l.producto_id === x.id));
      if (ya) return ls.map((l) => (l === ya ? { ...l, cantidad: l.cantidad + 1 } : l));
      return [
        ...ls,
        {
          clave: `i${++sec}`,
          descripcion: x.nombre,
          servicio_id: x.tipo === "servicio" ? x.id : null,
          producto_id: x.tipo === "producto" ? x.id : null,
          cantidad: 1,
          precio: x.precio,
          descuento: 0,
          itbis_tasa: x.itbis,
          existencia: x.existencia,
        },
      ];
    });
  }

  function lineaLibre() {
    setItems((ls) => [...ls, { clave: `i${++sec}`, descripcion: "", servicio_id: null, producto_id: null, cantidad: 1, precio: 0, descuento: 0, itbis_tasa: 18 }]);
  }

  function cambiar(clave: string, cambios: Partial<Item>) {
    setItems((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)).filter((l) => l.cantidad > 0));
  }

  function elegirCliente(c: ClientePos | null) {
    setClienteId(c?.id ?? "");
    setTipoNcf(c ? (c.tipo_comprobante ?? (c.rnc?.trim() ? "B01" : "B02")) : "B02");
    setACredito(false);
    setEligiendoCliente(false);
    setBuscarCliente("");
  }

  function abrirCobro() {
    setError(null);
    setPagos([{ forma: "efectivo", monto: totales.total.toFixed(2), referencia: "" }]);
    setACredito(false);
    setCobrando(true);
  }

  function confirmar() {
    setError(null);
    if (items.some((i) => !i.descripcion.trim())) return setError("Una línea no tiene descripción.");
    if (!aCredito && falta > 0) return setError(`Falta cobrar ${monto(falta)}.`);
    if (cambio > efectivo) return setError("Con tarjeta, transferencia o cheque no se puede cobrar más del total.");
    iniciar(async () => {
      const r = await ventaRapida({
        cliente_id: clienteId || null,
        tipo_ncf: tipoNcf,
        a_credito: aCredito,
        lineas: items.map((i) => ({
          descripcion: i.descripcion.trim(),
          servicio_id: i.servicio_id,
          producto_id: i.producto_id,
          cantidad: i.cantidad,
          precio: i.precio,
          descuento: i.descuento,
          itbis_tasa: i.itbis_tasa,
        })),
        pagos: pagos.filter((p) => num(p.monto) > 0).map((p) => ({ forma: p.forma, monto: num(p.monto), referencia: p.referencia || null })),
      });
      if (r.error) return setError(r.error);
      setHecha(r.venta!);
      setCobrando(false);
    });
  }

  function nuevaVenta() {
    setItems([]);
    setPagos([]);
    setHecha(null);
    elegirCliente(null);
    setTimeout(() => buscador.current?.focus(), 50);
  }

  const tiposDisponibles = tipos.filter((t) => t.serie === "B" || t.serie === "E");
  const tipoElegido = tipos.find((t) => t.codigo === tipoNcf);
  const faltaRnc = tipoElegido?.requiere_rnc && !cliente?.rnc?.trim();

  // ---------------- Venta terminada ----------------
  if (hecha) {
    const ticket = `/f/${hecha.token}/ticket`;
    const wa = enlaceWhatsapp(cliente?.telefono, `Gracias por su compra. Su factura ${hecha.ncf} por ${monto(hecha.total)}: ${typeof window !== "undefined" ? window.location.origin : ""}/f/${hecha.token}`);
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-6 py-10 text-center">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-lima text-marca-900">
          <Icono nombre="check" tam={32} grosor={2.5} />
        </span>
        <div>
          <p className="text-sm font-semibold text-stone-500">Venta completada</p>
          <h1 className="titulo font-mono">{hecha.ncf}</h1>
          <p className="mt-1 text-stone-600">Total {monto(hecha.total)}</p>
        </div>
        {hecha.cambio > 0 && (
          <div className="w-full rounded-2xl bg-marca-900 p-6 text-white">
            <p className="text-sm font-semibold text-marca-200">Cambio a devolver</p>
            <p className="font-display text-5xl font-semibold tracking-tight text-lima tabular-nums">{monto(hecha.cambio)}</p>
          </div>
        )}
        <div className="grid w-full gap-2 sm:grid-cols-2">
          <a href={ticket} target="_blank" rel="noopener noreferrer" className="boton h-12 text-base">
            <Icono nombre="imprimir" /> Imprimir ticket
          </a>
          <a href={`/f/${hecha.token}/pdf`} target="_blank" rel="noopener noreferrer" className="boton-sec h-12 text-base">
            <Icono nombre="descargar" /> PDF carta
          </a>
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="boton-sec h-12 text-base">
              <Icono nombre="whatsapp" /> WhatsApp
            </a>
          )}
          <Link href={`/oficina/facturacion/${hecha.factura_id}`} className="boton-sec h-12 text-base">
            <Icono nombre="documento" /> Ver factura
          </Link>
        </div>
        <button type="button" onClick={nuevaVenta} className="boton h-14 w-full bg-marca-900 text-lg hover:bg-marca-800" autoFocus>
          <Icono nombre="mas" /> Nueva venta
        </button>
      </div>
    );
  }

  // ---------------- Pantalla de venta ----------------
  return (
    <div className="grid gap-5 pb-20 xl:grid-cols-[1fr_420px] xl:pb-0">
      {/* Catálogo */}
      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="titulo">Venta rápida</h1>
            <p className="text-sm text-stone-500">Toca un servicio o producto para agregarlo. Cobra con F2.</p>
          </div>
          <SelectorFacturar activo="venta" />
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-2">
            {(
              [
                ["todo", "Todo"],
                ["servicios", "Servicios"],
                ["productos", "Productos"],
              ] as const
            ).map(([v, t]) => (
              <button key={v} type="button" onClick={() => setVista(v)} className={`pestana ${vista === v ? "pestana-activa" : "bg-white text-stone-700"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="relative">
          <Icono nombre="buscar" className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-stone-400" />
          <input
            ref={buscador}
            autoFocus
            type="search"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && catalogo[0]) {
                e.preventDefault();
                agregar(catalogo[0]);
                setBuscar("");
              }
            }}
            placeholder="Buscar servicio o producto (Enter agrega el primero)"
            className="campo h-12 pl-11 text-base"
            aria-label="Buscar servicio o producto"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
          {catalogo.map((x) => {
            const sinExistencia = x.tipo === "producto" && (x.existencia ?? 0) <= 0;
            return (
              <button
                key={`${x.tipo}-${x.id}`}
                type="button"
                onClick={() => agregar(x)}
                className="group flex min-h-28 flex-col justify-between gap-2 rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-suave transition hover:-translate-y-0.5 hover:border-marca-400 hover:shadow-flotante active:scale-[0.98]"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${x.tipo === "servicio" ? "bg-marca-50 text-marca-600" : "bg-lima-suave text-marca-700"}`}>
                    <Icono nombre={(x.tipo === "servicio" ? "rutas" : "inventario") as NombreIcono} tam={16} />
                  </span>
                  {x.tipo === "producto" && (
                    <span className={`chip ${sinExistencia ? "bg-orange-50 text-orange-700" : "bg-stone-100 text-stone-600"}`}>
                      {sinExistencia ? "Agotado" : `${x.existencia} ${x.unidad}`}
                    </span>
                  )}
                </span>
                <span className="text-sm leading-snug font-bold text-stone-900">{x.nombre}</span>
                <span className="font-display text-base font-semibold text-marca-700 tabular-nums">{monto(x.precio)}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={lineaLibre}
            className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 p-4 text-sm font-semibold text-stone-500 transition hover:border-marca-400 hover:text-marca-700"
          >
            <Icono nombre="mas" tam={22} /> Otro concepto
          </button>
        </div>
        {catalogo.length === 0 && buscar && <p className="text-sm text-stone-500">No hay nada con «{buscar}».</p>}
        {productos.length === 0 && (
          <p className="text-xs text-stone-500">
            Para vender productos márcalos como «se vende» en <Link href="/oficina/inventario" className="font-semibold text-marca-600 hover:underline">Inventario</Link>.
          </p>
        )}
      </section>

      {/* Ticket */}
      <aside className="flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-suave xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:self-start">
        <div className="space-y-3 border-b border-stone-100 p-4">
          <button
            type="button"
            onClick={() => setEligiendoCliente((v) => !v)}
            className="flex w-full items-center gap-3 rounded-xl bg-stone-50 px-3 py-2.5 text-left transition hover:bg-stone-100"
            aria-expanded={eligiendoCliente}
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marca-900 text-lima">
              <Icono nombre="usuario" tam={17} />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-sm">{cliente ? cliente.nombre : "Consumidor final"}</b>
              <span className="block truncate text-xs text-stone-500">
                {cliente ? [cliente.rnc ? `RNC ${cliente.rnc}` : "Sin RNC", cliente.pendiente > 0 && `debe ${monto(cliente.pendiente)}`, cliente.saldo_favor > 0 && `a favor ${monto(cliente.saldo_favor)}`].filter(Boolean).join(" · ") : "Toca para elegir un cliente"}
              </span>
            </span>
            <Icono nombre="derecha" tam={16} className={`text-stone-400 transition ${eligiendoCliente ? "rotate-90" : ""}`} />
          </button>
          {eligiendoCliente && (
            <div className="space-y-2 rounded-xl border border-stone-200 p-2">
              <input
                autoFocus
                type="search"
                className="campo"
                placeholder="Nombre, RNC o teléfono"
                value={buscarCliente}
                onChange={(e) => setBuscarCliente(e.target.value)}
                aria-label="Buscar cliente"
              />
              <ul className="max-h-60 overflow-y-auto text-sm">
                <li>
                  <button type="button" className="w-full rounded-lg px-2 py-2 text-left font-semibold hover:bg-stone-50" onClick={() => elegirCliente(null)}>
                    Consumidor final
                  </button>
                </li>
                {clientesFiltrados.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="flex w-full justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-stone-50" onClick={() => elegirCliente(c)}>
                      <span className="min-w-0 truncate">{c.nombre}</span>
                      <span className="shrink-0 text-xs text-stone-500">{c.rnc ?? ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex items-center gap-2">
            <label htmlFor="pos-ncf" className="text-xs font-semibold text-stone-600">Comprobante</label>
            <select id="pos-ncf" value={tipoNcf} onChange={(e) => setTipoNcf(e.target.value)} className="campo h-9 flex-1 py-1">
              {tiposDisponibles.map((t) => (
                <option key={t.codigo} value={t.codigo}>{t.codigo} · {t.nombre}</option>
              ))}
            </select>
          </div>
          {faltaRnc && <p className="text-xs text-amber-700">Este comprobante necesita un cliente con RNC.</p>}
        </div>

        <ul className="min-h-40 flex-1 divide-y divide-stone-100 overflow-y-auto">
          {items.length === 0 && (
            <li className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-stone-400">
              <Icono nombre="venta" tam={28} grosor={1.5} />
              La venta está vacía
            </li>
          )}
          {items.map((i) => {
            const c = calcularLinea({ ...i, itbis_tasa: tasa(i.itbis_tasa) });
            const pocas = i.producto_id && i.existencia !== undefined && i.cantidad > i.existencia;
            return (
              <li key={i.clave} className="space-y-2 px-4 py-3">
                <div className="flex items-start gap-2">
                  {i.servicio_id || i.producto_id ? (
                    <span className="flex-1 text-sm font-semibold">{i.descripcion}</span>
                  ) : (
                    <input
                      autoFocus
                      className="campo h-8 flex-1 py-1 text-sm"
                      placeholder="Descripción"
                      value={i.descripcion}
                      onChange={(e) => cambiar(i.clave, { descripcion: e.target.value })}
                      aria-label="Descripción"
                    />
                  )}
                  <span className="text-sm font-bold tabular-nums">{monto(c.subtotal + c.itbis)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center rounded-lg border border-stone-200">
                    <button type="button" className="p-1.5 text-stone-500 hover:text-stone-900" onClick={() => cambiar(i.clave, { cantidad: i.cantidad - 1 })} aria-label={`Quitar uno de ${i.descripcion}`}>
                      <Icono nombre="menos" tam={14} />
                    </button>
                    <input
                      className="w-12 border-0 bg-transparent text-center text-sm font-semibold tabular-nums outline-none"
                      value={i.cantidad}
                      inputMode="decimal"
                      onChange={(e) => cambiar(i.clave, { cantidad: Number(e.target.value) || 0 })}
                      aria-label={`Cantidad de ${i.descripcion}`}
                    />
                    <button type="button" className="p-1.5 text-stone-500 hover:text-stone-900" onClick={() => cambiar(i.clave, { cantidad: i.cantidad + 1 })} aria-label={`Agregar uno de ${i.descripcion}`}>
                      <Icono nombre="mas" tam={14} />
                    </button>
                  </div>
                  <span className="text-xs text-stone-400">×</span>
                  <input
                    className="campo h-8 w-28 py-1 text-right text-sm tabular-nums"
                    inputMode="decimal"
                    value={i.precio}
                    onChange={(e) => cambiar(i.clave, { precio: num(e.target.value) })}
                    aria-label={`Precio de ${i.descripcion}`}
                  />
                  <span className="flex-1" />
                  <button type="button" onClick={() => cambiar(i.clave, { cantidad: 0 })} className="rounded-lg p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-700" aria-label={`Quitar ${i.descripcion}`}>
                    <Icono nombre="papelera" tam={15} />
                  </button>
                </div>
                {pocas && <p className="text-xs text-amber-700">Solo hay {i.existencia} en inventario.</p>}
              </li>
            );
          })}
        </ul>

        <div className="space-y-3 border-t border-stone-200 bg-stone-50 p-4">
          <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm tabular-nums">
            <dt className="text-stone-500">Subtotal</dt>
            <dd className="text-right">{monto(totales.neto)}</dd>
            <dt className="text-stone-500">ITBIS{cliente?.exento_itbis ? " (exento)" : ""}</dt>
            <dd className="text-right">{monto(totales.itbis)}</dd>
            <dt className="pt-1 font-display text-lg font-semibold">Total</dt>
            <dd className="pt-1 text-right font-display text-2xl font-semibold tracking-tight">{monto(totales.total)}</dd>
          </dl>
          <button type="button" disabled={!items.length || !!faltaRnc} onClick={abrirCobro} className="boton h-14 w-full text-lg">
            <Icono nombre="dinero" /> Cobrar <kbd className="ml-1 rounded bg-white/15 px-1.5 text-xs">F2</kbd>
          </button>
        </div>
      </aside>

      {/* Celular: total y cobrar siempre a mano */}
      {items.length > 0 && !cobrando && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-stone-200 bg-white/95 px-4 py-3 shadow-flotante backdrop-blur xl:hidden">
          <span className="flex-1">
            <span className="block text-xs text-stone-500">{items.reduce((s, i) => s + i.cantidad, 0)} artículo(s)</span>
            <span className="font-display text-xl font-semibold tabular-nums">{monto(totales.total)}</span>
          </span>
          <button type="button" disabled={!!faltaRnc} onClick={abrirCobro} className="boton h-12 px-6 text-base">
            <Icono nombre="dinero" /> Cobrar
          </button>
        </div>
      )}

      {/* Cobro */}
      {cobrando && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-marca-950/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Cobrar">
          <div className="max-h-[95vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-6 shadow-flotante sm:rounded-3xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-stone-500">Total a cobrar</p>
                <p className="font-display text-4xl font-semibold tracking-tight tabular-nums">{monto(totales.total)}</p>
              </div>
              <button type="button" onClick={() => setCobrando(false)} className="rounded-xl p-2 text-stone-400 hover:bg-stone-100" aria-label="Cerrar">
                <Icono nombre="cerrar" />
              </button>
            </div>

            {cliente && (
              <label className={`mb-4 flex items-center gap-3 rounded-xl border p-3 text-sm ${aCredito ? "border-marca-400 bg-marca-50" : "border-stone-200"}`}>
                <input
                  type="checkbox"
                  checked={aCredito}
                  onChange={(e) => {
                    setACredito(e.target.checked);
                    if (e.target.checked) setPagos([]);
                    else setPagos([{ forma: "efectivo", monto: totales.total.toFixed(2), referencia: "" }]);
                  }}
                  className="h-5 w-5 accent-marca-600"
                />
                <span className="flex-1">
                  <b>Vender a crédito</b> · {Math.max(cliente.dias_credito, 1)} días
                  {cliente.limite_credito !== null && (
                    <span className="block text-xs text-stone-500">
                      Debe {monto(cliente.pendiente)} de un límite de {monto(cliente.limite_credito)}
                    </span>
                  )}
                </span>
              </label>
            )}
            {aCredito && (pasaLimite || cliente?.vencidas) && (
              <p className={`mb-4 flex gap-2 rounded-xl px-3 py-2 text-sm ${bloquearCredito ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
                <Icono nombre="alerta" className="mt-0.5 shrink-0" />
                {pasaLimite ? "Con esta venta pasa su límite de crédito." : "Tiene facturas vencidas."} {bloquearCredito ? "La empresa no permite venderle a crédito." : "Puedes seguir, pero revísalo."}
              </p>
            )}

            <div className="space-y-2">
              {pagos.map((p, i) => {
                const f = FORMAS_PAGO.find((x) => x.valor === p.forma);
                return (
                  <div key={i} className="space-y-2 rounded-xl bg-stone-50 p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {FORMAS_PAGO.filter((x) => x.valor !== "saldo_favor" || (cliente?.saldo_favor ?? 0) > 0).map((x) => (
                        <button
                          key={x.valor}
                          type="button"
                          onClick={() => setPagos((ps) => ps.map((y, j) => (j === i ? { ...y, forma: x.valor } : y)))}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ring-1 ${p.forma === x.valor ? "bg-marca-900 text-white ring-marca-900" : "bg-white text-stone-700 ring-stone-300"}`}
                        >
                          <Icono nombre={x.icono} tam={14} /> {x.texto}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        className="campo h-12 flex-1 text-right font-display text-xl tabular-nums"
                        inputMode="decimal"
                        value={p.monto}
                        autoFocus={i === pagos.length - 1}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setPagos((ps) => ps.map((y, j) => (j === i ? { ...y, monto: e.target.value } : y)))}
                        aria-label={`Monto en ${f?.texto}`}
                      />
                      {pagos.length > 1 && (
                        <button type="button" className="rounded-xl px-3 text-stone-400 hover:bg-red-50 hover:text-red-700" onClick={() => setPagos((ps) => ps.filter((_, j) => j !== i))} aria-label="Quitar forma de pago">
                          <Icono nombre="cerrar" />
                        </button>
                      )}
                    </div>
                    {f?.referencia && (
                      <input
                        className="campo"
                        placeholder={f.referencia}
                        value={p.referencia}
                        onChange={(e) => setPagos((ps) => ps.map((y, j) => (j === i ? { ...y, referencia: e.target.value } : y)))}
                        aria-label={f.referencia}
                      />
                    )}
                    {p.forma === "efectivo" && (
                      <div className="flex flex-wrap gap-1.5">
                        {[...new Set([Math.ceil(totales.total / 100) * 100, Math.ceil(totales.total / 500) * 500, Math.ceil(totales.total / 1000) * 1000, Math.ceil(totales.total / 2000) * 2000])]
                          .filter((v) => v > totales.total)
                          .slice(0, 3)
                          .map((v) => (
                            <button key={v} type="button" className="boton-sec boton-chico" onClick={() => setPagos((ps) => ps.map((y, j) => (j === i ? { ...y, monto: String(v) } : y)))}>
                              {monto(v)}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                className="text-sm font-semibold text-marca-600 hover:underline"
                onClick={() => setPagos((ps) => [...ps, { forma: ps.some((p) => p.forma === "efectivo") ? "tarjeta" : "efectivo", monto: falta ? falta.toFixed(2) : "", referencia: "" }])}
              >
                + Dividir el pago
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className={`rounded-2xl p-4 ${falta > 0 && !aCredito ? "bg-orange-50 text-orange-800" : "bg-stone-50 text-stone-500"}`}>
                <p className="text-xs font-bold">{aCredito ? "Queda a crédito" : "Falta"}</p>
                <p className="font-display text-xl font-semibold tabular-nums">{monto(falta)}</p>
              </div>
              <div className={`rounded-2xl p-4 ${cambio > 0 ? "bg-marca-900 text-white" : "bg-stone-50 text-stone-500"}`}>
                <p className={`text-xs font-bold ${cambio > 0 ? "text-marca-200" : ""}`}>Cambio</p>
                <p className={`font-display text-xl font-semibold tabular-nums ${cambio > 0 ? "text-lima" : ""}`}>{monto(cambio)}</p>
              </div>
            </div>

            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            <button
              type="button"
              onClick={confirmar}
              disabled={pendiente || (!aCredito && falta > 0) || (aCredito && bloquearCredito && (pasaLimite || !!cliente?.vencidas))}
              className="boton mt-5 h-14 w-full text-lg"
            >
              {pendiente ? "Procesando…" : aCredito ? "Facturar a crédito" : "Confirmar venta"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
