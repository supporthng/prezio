"use client";

import { useMemo, useState } from "react";
import { BotonEnviar, Formulario } from "@/components/Formulario";
import { calcularLinea, calcularTotales, MONEDAS, monto, NOMBRE_DOC, TASAS_ITBIS, TEXTO_REEMBOLSO } from "@/lib/facturacion";
import { Icono } from "@/components/Icono";
import { fechaSimple } from "@/lib/formato";
import type { LineaFactura, Producto, Reembolso, Servicio, TipoComprobante, TipoDocumento, VisitaPorFacturar } from "@/lib/tipos";
import { guardarDocumento } from "./acciones";

export type ClienteFacturacion = {
  id: string;
  nombre: string;
  razon_social: string | null;
  rnc: string | null;
  tipo_comprobante: string | null;
  dias_credito: number;
  exento_itbis: boolean;
  moneda?: string | null;
  limite_credito?: number | null;
  pendiente?: number;
};

export type DocumentoInicial = {
  id: string | null;
  tipo_doc: TipoDocumento;
  tipo_ncf: string | null;
  cliente_id: string;
  fecha: string;
  dias_credito: number;
  notas: string | null;
  referencia_id: string | null;
  referencia_ncf: string | null;
  referencia_saldo?: number;
  moneda?: string;
  tasa_cambio?: number;
  reembolso?: Reembolso;
  devuelve_inventario?: boolean;
  lineas: LineaFactura[];
};

type Linea = LineaFactura & { clave: string };

let contador = 0;
const nuevaClave = () => `l${++contador}`;

export function Editor({
  inicial,
  clientes,
  tipos,
  servicios,
  productos = [],
  pendientes,
}: {
  inicial: DocumentoInicial;
  clientes: ClienteFacturacion[];
  tipos: TipoComprobante[];
  servicios: Servicio[];
  productos?: Producto[];
  pendientes: VisitaPorFacturar[];
}) {
  const [tipoDoc, setTipoDoc] = useState<TipoDocumento>(inicial.tipo_doc);
  const [clienteId, setClienteId] = useState(inicial.cliente_id);
  const [tipoNcf, setTipoNcf] = useState(inicial.tipo_ncf ?? "");
  const [fecha, setFecha] = useState(inicial.fecha);
  const [dias, setDias] = useState(String(inicial.dias_credito));
  const [notas, setNotas] = useState(inicial.notas ?? "");
  const [lineas, setLineas] = useState<Linea[]>(() => inicial.lineas.map((l) => ({ ...l, clave: nuevaClave() })));
  const [buscar, setBuscar] = useState("");
  const [moneda, setMoneda] = useState(inicial.moneda ?? "DOP");
  const [tasa, setTasa] = useState(String(inicial.tasa_cambio ?? 1));
  const [reembolso, setReembolso] = useState<Reembolso>(inicial.reembolso ?? "saldo");
  const [devuelve, setDevuelve] = useState(inicial.devuelve_inventario ?? true);

  const esNota = tipoDoc === "nota_credito";
  const cliente = clientes.find((c) => c.id === clienteId) ?? null;
  const tasaCliente = cliente?.exento_itbis ? 0 : 18;

  const tiposDisponibles = tipos.filter((t) => (esNota ? t.es_nota_credito : !t.es_nota_credito));
  const tipoElegido = tipos.find((t) => t.codigo === tipoNcf);
  const faltaRnc = tipoDoc !== "proforma" && tipoElegido?.requiere_rnc && !cliente?.rnc?.trim();

  const usadas = new Set(lineas.map((l) => l.visita_id).filter(Boolean));
  const visitasCliente = pendientes.filter((v) => v.cliente_id === clienteId && !usadas.has(v.id));

  const totales = useMemo(() => calcularTotales(lineas), [lineas]);

  const clientesFiltrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) => [c.nombre, c.razon_social, c.rnc].some((x) => x?.toLowerCase().includes(q)) || c.id === clienteId);
  }, [buscar, clientes, clienteId]);

  function elegirCliente(id: string) {
    setClienteId(id);
    const c = clientes.find((x) => x.id === id);
    if (!c) return;
    // Sugerencias según la ficha del cliente
    if (tipoDoc === "factura") {
      setTipoNcf(c.tipo_comprobante ?? (c.rnc?.trim() ? "B01" : "B02"));
      setDias(String(c.dias_credito ?? 0));
    }
    if (c.moneda && c.moneda !== moneda && !esNota) {
      setMoneda(c.moneda);
      if (c.moneda === "DOP") setTasa("1");
    }
    // Los servicios del cliente anterior ya no aplican
    setLineas((ls) => ls.filter((l) => !l.visita_id).map((l) => ({ ...l, itbis_tasa: c.exento_itbis ? 0 : l.itbis_tasa })));
  }

  function cambiar(clave: string, campo: keyof LineaFactura, valor: string | number | null) {
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, [campo]: valor } : l)));
  }

  function agregarVisita(v: VisitaPorFacturar) {
    const s = servicios.find((x) => x.id === v.servicio_id);
    setLineas((ls) => [
      ...ls,
      {
        clave: nuevaClave(),
        descripcion: `${v.servicio ?? "Servicio"} · ${v.sucursal} · ${fechaSimple(v.fecha)}`,
        servicio_id: v.servicio_id,
        visita_id: v.id,
        cantidad: 1,
        precio: Number(v.precio ?? s?.precio_base ?? 0),
        descuento: 0,
        itbis_tasa: v.exento_itbis ? 0 : 18,
      },
    ]);
  }

  function agregarLinea(clave?: string) {
    const p = clave?.startsWith("p:") ? productos.find((x) => x.id === clave.slice(2)) : undefined;
    const s = !p && clave ? servicios.find((x) => x.id === clave) : undefined;
    setLineas((ls) => [
      ...ls,
      {
        clave: nuevaClave(),
        descripcion: p?.nombre ?? s?.nombre ?? "",
        servicio_id: s?.id ?? null,
        producto_id: p?.id ?? null,
        visita_id: null,
        cantidad: 1,
        precio: Number(p ? (p.precio_venta ?? 0) : (s?.precio_base ?? 0)),
        descuento: 0,
        itbis_tasa: cliente?.exento_itbis ? 0 : p ? Number(p.itbis_tasa ?? 18) : tasaCliente,
      },
    ]);
  }

  const diasNum = Number(dias) || 0;
  const pasaLimite =
    tipoDoc === "factura" && diasNum > 0 && cliente?.limite_credito != null && (cliente.pendiente ?? 0) + totales.total * (moneda === "DOP" ? 1 : Number(tasa) || 0) > cliente.limite_credito;
  const tieneProductos = lineas.some((l) => l.producto_id);
  const restoNota = esNota ? Math.max(totales.total - (inicial.referencia_saldo ?? 0), 0) : 0;

  const datos = JSON.stringify({
    id: inicial.id,
    tipo_doc: tipoDoc,
    tipo_ncf: tipoDoc === "proforma" ? null : tipoNcf || null,
    cliente_id: clienteId,
    fecha,
    dias_credito: tipoDoc === "factura" ? Number(dias) || 0 : 0,
    notas: notas || null,
    referencia_id: inicial.referencia_id,
    reembolso,
    devuelve_inventario: devuelve,
    moneda,
    tasa_cambio: moneda === "DOP" ? 1 : Number(tasa) || 0,
    lineas: lineas.map((l) => ({
      descripcion: l.descripcion,
      servicio_id: l.servicio_id,
      producto_id: l.producto_id ?? null,
      visita_id: l.visita_id,
      cantidad: Number(l.cantidad),
      precio: Number(l.precio),
      descuento: Number(l.descuento) || 0,
      itbis_tasa: Number(l.itbis_tasa),
    })),
  });

  const textoEmitir =
    tipoDoc === "proforma" ? "Emitir proforma" : `Emitir ${esNota ? "nota de crédito" : "factura"}${tipoNcf ? ` ${tipoNcf}` : ""}`;

  return (
    <Formulario
      accion={guardarDocumento}
      className="grid gap-5 lg:grid-cols-[1fr_320px]"
    >
      <input type="hidden" name="datos" value={datos} />
      <div className="min-w-0 space-y-5">
        {/* Tipo de documento */}
        {!inicial.id && !esNota && (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de documento">
            {(["factura", "proforma"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={tipoDoc === t}
                onClick={() => {
                  setTipoDoc(t);
                  if (t === "factura" && cliente && !tipoNcf) setTipoNcf(cliente.tipo_comprobante ?? (cliente.rnc?.trim() ? "B01" : "B02"));
                }}
                className={`rounded-full px-4 py-1.5 text-sm font-medium ring-1 ${
                  tipoDoc === t ? "bg-marca-600 text-white ring-marca-600" : "bg-white text-stone-600 ring-stone-300 hover:bg-stone-50"
                }`}
              >
                {NOMBRE_DOC[t]}
              </button>
            ))}
          </div>
        )}

        {/* Cliente y comprobante */}
        <section className="tarjeta grid gap-4 p-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <label className="etiqueta" htmlFor="cliente">Cliente</label>
            {esNota ? (
              <p className="text-sm font-medium">{cliente?.nombre}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <input
                  type="search"
                  placeholder="Buscar por nombre o RNC"
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                  className="campo w-full sm:w-56"
                  aria-label="Buscar cliente"
                />
                <select id="cliente" className="campo min-w-0 flex-1" value={clienteId} onChange={(e) => elegirCliente(e.target.value)}>
                  <option value="">Elige el cliente…</option>
                  {clientesFiltrados.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                      {c.rnc ? ` · ${c.rnc}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {cliente && (
              <p className="text-xs text-stone-500">
                Se factura a: <b className="text-stone-700">{cliente.razon_social || cliente.nombre}</b>
                {cliente.rnc ? ` · RNC ${cliente.rnc}` : " · sin RNC"}
                {cliente.exento_itbis && " · exento de ITBIS"}
                {(cliente.pendiente ?? 0) > 0 && <span className="text-amber-700"> · debe {monto(cliente.pendiente)}</span>}
                {cliente.limite_credito != null && ` · límite ${monto(cliente.limite_credito)}`}
              </p>
            )}
          </div>

          {tipoDoc !== "proforma" && (
            <div className="space-y-1">
              <label className="etiqueta" htmlFor="tipo_ncf">Comprobante</label>
              <select id="tipo_ncf" className="campo w-full" value={tipoNcf} onChange={(e) => setTipoNcf(e.target.value)}>
                <option value="">Elige…</option>
                {(["B", "E"] as const).map((serie) => (
                  <optgroup key={serie} label={serie === "B" ? "Serie B (papel)" : "Serie E (electrónica)"}>
                    {tiposDisponibles
                      .filter((t) => t.serie === serie)
                      .map((t) => (
                        <option key={t.codigo} value={t.codigo}>
                          {t.codigo} · {t.nombre}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              {faltaRnc && <p className="text-xs text-amber-700">Este comprobante necesita el RNC o la cédula del cliente.</p>}
              {esNota && inicial.referencia_ncf && <p className="text-xs text-stone-500">Modifica la factura {inicial.referencia_ncf}</p>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="etiqueta" htmlFor="moneda">Moneda</label>
              <select
                id="moneda"
                className="campo w-full"
                value={moneda}
                disabled={esNota}
                onChange={(e) => {
                  setMoneda(e.target.value);
                  if (e.target.value === "DOP") setTasa("1");
                  else if (Number(tasa) <= 1) setTasa("");
                }}
              >
                {MONEDAS.map((m) => (
                  <option key={m.valor} value={m.valor}>{m.simbolo} · {m.texto}</option>
                ))}
              </select>
            </div>
            {moneda !== "DOP" ? (
              <div className="space-y-1">
                <label className="etiqueta" htmlFor="tasa">Tasa (RD$ por 1 {moneda})</label>
                <input id="tasa" inputMode="decimal" className="campo w-full" value={tasa} disabled={esNota} onChange={(e) => setTasa(e.target.value)} placeholder="Ej. 60.25" required />
              </div>
            ) : (
              <div />
            )}
            <div className="space-y-1">
              <label className="etiqueta" htmlFor="fecha">Fecha</label>
              <input id="fecha" type="date" className="campo w-full" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
            </div>
            {tipoDoc === "factura" && (
              <div className="space-y-1">
                <label className="etiqueta" htmlFor="dias">Días de crédito</label>
                <input id="dias" type="number" min={0} max={365} className="campo w-full" value={dias} onChange={(e) => setDias(e.target.value)} />
              </div>
            )}
          </div>
        </section>

        {/* Servicios realizados sin facturar */}
        {cliente && tipoDoc !== "nota_credito" && visitasCliente.length > 0 && (
          <section className="tarjeta p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="subtitulo">Servicios realizados sin facturar ({visitasCliente.length})</h2>
              <button type="button" className="boton-sec boton-chico" onClick={() => visitasCliente.forEach(agregarVisita)}>
                Agregar todos
              </button>
            </div>
            <ul className="divide-y divide-stone-100 text-sm">
              {visitasCliente.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {fechaSimple(v.fecha)} · {v.sucursal} · <span className="text-stone-500">{v.servicio ?? "Servicio"}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums">{monto(v.precio)}</span>
                    <button type="button" className="boton-sec boton-chico" onClick={() => agregarVisita(v)}>
                      Agregar
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Líneas */}
        <section className="tarjeta overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-stone-50 text-left text-xs text-stone-500">
              <tr>
                <th className="px-3 py-2 font-medium">Descripción</th>
                <th className="w-20 px-2 py-2 font-medium">Cant.</th>
                <th className="w-28 px-2 py-2 font-medium">Precio</th>
                <th className="w-24 px-2 py-2 font-medium">Descuento</th>
                <th className="w-24 px-2 py-2 font-medium">ITBIS</th>
                <th className="w-28 px-2 py-2 text-right font-medium">Importe</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {lineas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-stone-500">
                    Todavía no hay líneas. Agrega un servicio realizado o una línea nueva.
                  </td>
                </tr>
              )}
              {lineas.map((l, i) => {
                const c = calcularLinea(l);
                return (
                  <tr key={l.clave} className="align-top">
                    <td className="px-3 py-2">
                      <input
                        className="campo w-full"
                        value={l.descripcion}
                        onChange={(e) => cambiar(l.clave, "descripcion", e.target.value)}
                        aria-label={`Descripción de la línea ${i + 1}`}
                        required
                      />
                      {l.visita_id && <span className="text-xs text-marca-700">Servicio realizado</span>}
                      {l.producto_id && <span className="text-xs text-marca-700">Producto del inventario</span>}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number" step="any" min={0.01} className="campo w-full" value={l.cantidad}
                        onChange={(e) => cambiar(l.clave, "cantidad", e.target.value as unknown as number)}
                        aria-label={`Cantidad de la línea ${i + 1}`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number" step="0.01" min={0} className="campo w-full" value={l.precio}
                        onChange={(e) => cambiar(l.clave, "precio", e.target.value as unknown as number)}
                        aria-label={`Precio de la línea ${i + 1}`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number" step="0.01" min={0} className="campo w-full" value={l.descuento}
                        onChange={(e) => cambiar(l.clave, "descuento", e.target.value as unknown as number)}
                        aria-label={`Descuento de la línea ${i + 1}`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className="campo w-full" value={l.itbis_tasa}
                        onChange={(e) => cambiar(l.clave, "itbis_tasa", Number(e.target.value))}
                        aria-label={`ITBIS de la línea ${i + 1}`}
                      >
                        {TASAS_ITBIS.map((t) => (
                          <option key={t.valor} value={t.valor}>{t.texto}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {monto(c.subtotal, moneda)}
                      {c.itbis > 0 && <div className="text-xs text-stone-500">+ {monto(c.itbis, moneda)}</div>}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
                        className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-700"
                        aria-label={`Quitar la línea ${i + 1}`}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 p-3">
            <button type="button" className="boton-sec boton-chico" onClick={() => agregarLinea()}>
              + Línea en blanco
            </button>
            <select
              className="campo max-w-xs text-sm"
              value=""
              onChange={(e) => e.target.value && agregarLinea(e.target.value)}
              aria-label="Agregar un servicio del catálogo"
            >
              <option value="">+ Del catálogo…</option>
              <optgroup label="Servicios">
                {servicios.filter((s) => s.activo).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre} · {monto(s.precio_base)}
                  </option>
                ))}
              </optgroup>
              {productos.length > 0 && (
                <optgroup label="Productos">
                  {productos.map((p) => (
                    <option key={p.id} value={`p:${p.id}`}>
                      {p.nombre} · {monto(p.precio_venta ?? 0)} · hay {Number(p.existencia ?? 0)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </section>

        <div className="space-y-1">
          <label className="etiqueta" htmlFor="notas">Notas (salen impresas)</label>
          <textarea id="notas" rows={2} className="campo w-full" value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>
      </div>

      {/* Totales y acciones */}
      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <div className="tarjeta space-y-2 p-4 text-sm">
          <h2 className="subtitulo">{NOMBRE_DOC[tipoDoc]}</h2>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1 tabular-nums">
            <dt className="text-stone-500">Subtotal</dt>
            <dd className="text-right">{monto(totales.subtotal, moneda)}</dd>
            {totales.descuento > 0 && (
              <>
                <dt className="text-stone-500">Descuento</dt>
                <dd className="text-right">− {monto(totales.descuento, moneda)}</dd>
              </>
            )}
            <dt className="text-stone-500">ITBIS</dt>
            <dd className="text-right">{monto(totales.itbis, moneda)}</dd>
            <dt className="border-t border-stone-200 pt-2 font-semibold">Total</dt>
            <dd className="border-t border-stone-200 pt-2 text-right text-lg font-semibold">{monto(totales.total, moneda)}</dd>
            {moneda !== "DOP" && Number(tasa) > 0 && (
              <>
                <dt className="text-xs text-stone-500">Equivale a (tasa {tasa})</dt>
                <dd className="text-right text-xs text-stone-500">{monto(totales.total * Number(tasa))}</dd>
              </>
            )}
          </dl>
        </div>
        {esNota && (
          <div className="tarjeta space-y-3 p-4 text-sm">
            <h2 className="subtitulo">Devolución</h2>
            {inicial.referencia_saldo !== undefined && (
              <p className="text-xs text-stone-600">
                La factura {inicial.referencia_ncf} debe {monto(inicial.referencia_saldo, moneda)}. Primero se rebaja esa deuda
                {restoNota > 0 ? `; sobran ${monto(restoNota, moneda)}.` : "; no sobra nada para devolver."}
              </p>
            )}
            {restoNota > 0 && (
              <div>
                <label className="etiqueta" htmlFor="reembolso">¿Qué se hace con lo que sobra?</label>
                <select id="reembolso" className="campo" value={reembolso} onChange={(e) => setReembolso(e.target.value as Reembolso)}>
                  {(Object.keys(TEXTO_REEMBOLSO) as Reembolso[]).map((r) => (
                    <option key={r} value={r}>{TEXTO_REEMBOLSO[r]}</option>
                  ))}
                </select>
              </div>
            )}
            {tieneProductos && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={devuelve} onChange={(e) => setDevuelve(e.target.checked)} className="h-4 w-4 accent-marca-600" />
                Los productos regresan al inventario
              </label>
            )}
          </div>
        )}
        {pasaLimite && (
          <p className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <Icono nombre="alerta" tam={16} className="shrink-0" />
            Con esta factura el cliente pasa su límite de crédito de {monto(cliente?.limite_credito)} (ya debe {monto(cliente?.pendiente)}).
          </p>
        )}
        <div className="flex flex-col gap-2">
          <BotonEnviar name="accion" value="emitir" pendiente="Emitiendo…">
            {textoEmitir}
          </BotonEnviar>
          <BotonEnviar name="accion" value="guardar" className="boton-sec">
            Guardar borrador
          </BotonEnviar>
          {tipoElegido?.serie === "E" && (
            <p className="text-xs text-stone-500">
              Se emite con su número e-NCF y queda pendiente de envío a la DGII hasta conectar el certificado digital.
            </p>
          )}
          {tipoDoc !== "proforma" && (
            <p className="text-xs text-stone-500">Al emitir se toma el siguiente número de la secuencia y ya no se puede editar.</p>
          )}
        </div>
      </aside>
    </Formulario>
  );
}
