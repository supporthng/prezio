import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Estado } from "@/components/Estado";
import { BotonEnviar, Formulario } from "@/components/Formulario";
import { catalogos } from "@/lib/datos";
import { dinero, enlaceWhatsapp, fechaSimple, hoyRD, textoFrecuencia } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Cliente, GarantiaDetalle, Sucursal, VisitaDetalle } from "@/lib/tipos";
import { borrarCliente, crearSucursal, editarCliente } from "../../acciones";
import { guardarFacturacionCliente } from "../../facturacion/acciones";
import { monto, numeroDocumento } from "@/lib/facturacion";
import type { Factura, TipoComprobante } from "@/lib/tipos";
import { CamposSucursal } from "../CamposSucursal";

export async function generateMetadata({ params }: PageProps<"/oficina/clientes/[id]">): Promise<Metadata> {
  const { id } = await params;
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("clientes").select("nombre").eq("id", id).maybeSingle();
  return { title: data?.nombre ?? "Cliente" };
}

export default async function FichaCliente({ params }: PageProps<"/oficina/clientes/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await supabaseServidor();
  const hoy = hoyRD();

  const [{ data: cliente }, { data: sucs }, cat, { data: proximas }, { data: recientes }, { data: garantias }] = await Promise.all([
    supabase.from("clientes").select("*").eq("id", id).maybeSingle(),
    supabase.from("sucursales").select("*").eq("cliente_id", id).order("nombre"),
    catalogos(),
    supabase.from("visitas_detalle").select("*").eq("cliente_id", id).gte("fecha", hoy).eq("estado", "programada").order("fecha").limit(200),
    supabase.from("visitas_detalle").select("*").eq("cliente_id", id).lt("fecha", hoy).order("fecha", { ascending: false }).limit(15),
    supabase.from("garantias_detalle").select("*").eq("cliente_id", id).order("vence"),
  ]);
  const [{ data: tiposData }, { data: factData }] = await Promise.all([
    supabase.from("tipos_comprobante").select("*").eq("es_nota_credito", false).order("codigo"),
    supabase.from("facturas").select("id, tipo_doc, ncf, numero_proforma, estado, fecha, total, moneda").eq("cliente_id", id).order("fecha", { ascending: false }).limit(8),
  ]);
  const tipos = (tiposData ?? []) as TipoComprobante[];
  const facturas = (factData ?? []) as Factura[];
  if (!cliente) notFound();
  const c = cliente as Cliente;
  const sucursales = (sucs ?? []) as Sucursal[];
  const prox = (proximas ?? []) as VisitaDetalle[];
  const hist = (recientes ?? []) as VisitaDetalle[];
  const gar = (garantias ?? []) as GarantiaDetalle[];
  const zonaTexto = (zid: string | null) => {
    const z = cat.zonas.find((x) => x.id === zid);
    if (!z) return "Sin zona";
    return `${z.nombre}, ${cat.regiones.find((r) => r.id === z.region_id)?.nombre ?? ""}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/oficina/clientes" className="text-sm text-marca-700 hover:underline">← Clientes</Link>
        <h1 className="titulo mt-1">
          {c.nombre}
          {!c.activo && <span className="ml-2 align-middle text-sm font-normal text-stone-400">inactivo</span>}
        </h1>
        {(c.razon_social || c.rnc) && (
          <p className="text-sm text-stone-500">
            {[c.razon_social && c.razon_social !== c.nombre && `Factura a: ${c.razon_social}`, c.rnc && `RNC ${c.rnc}`].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="subtitulo">Sucursales ({sucursales.length})</h2>
            {sucursales.length === 0 && (
              <div className="tarjeta p-6 text-sm text-stone-500">Agrega la primera sucursal con el formulario de abajo.</div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              {sucursales.map((s) => {
                const servicio = cat.servicios.find((x) => x.id === s.servicio_id);
                const tecnico = cat.usuarios.find((x) => x.id === s.tecnico_id);
                const siguiente = prox.find((v) => v.sucursal_id === s.id);
                const wa = enlaceWhatsapp(s.contacto_whatsapp);
                return (
                  <article key={s.id} className={`tarjeta space-y-2 p-4 ${s.activa ? "" : "opacity-60"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-stone-900">{s.nombre}</h3>
                        <p className="text-xs text-stone-500">{zonaTexto(s.zona_id)}</p>
                      </div>
                      <Link href={`/oficina/clientes/${c.id}/sucursales/${s.id}`} className="boton-sec boton-chico">Editar</Link>
                    </div>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                      <dt className="text-stone-500">Servicio</dt>
                      <dd>{servicio?.nombre ?? "—"}</dd>
                      <dt className="text-stone-500">Precio</dt>
                      <dd>{dinero(s.precio ?? servicio?.precio_base)}{s.precio === null && servicio ? " (base)" : ""}</dd>
                      <dt className="text-stone-500">Frecuencia</dt>
                      <dd>{textoFrecuencia(s.frecuencia_unidad, s.frecuencia_cada, s.dia_mes, s.dia_semana)}</dd>
                      <dt className="text-stone-500">Técnico</dt>
                      <dd>{tecnico?.nombre ?? <span className="text-amber-700">Sin asignar</span>}</dd>
                      <dt className="text-stone-500">Contacto</dt>
                      <dd>
                        {s.contacto_nombre ?? "—"}
                        {wa && (
                          <a href={wa} target="_blank" rel="noopener noreferrer" className="ml-2 text-marca-700 hover:underline">
                            WhatsApp
                          </a>
                        )}
                      </dd>
                      <dt className="text-stone-500">Próxima</dt>
                      <dd>{s.activa ? (siguiente ? fechaSimple(siguiente.fecha) : "Sin programar") : "Inactiva"}</dd>
                    </dl>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="tarjeta p-4">
            <h2 className="subtitulo mb-3">Agregar sucursal</h2>
            <Formulario accion={crearSucursal} limpiar className="space-y-3">
              <input type="hidden" name="cliente" value={c.id} />
              <CamposSucursal regiones={cat.regiones} zonas={cat.zonas} servicios={cat.servicios} tecnicos={cat.tecnicos} />
              <BotonEnviar>Agregar sucursal</BotonEnviar>
            </Formulario>
          </section>

          <section className="space-y-3">
            <h2 className="subtitulo">Últimos servicios</h2>
            {hist.length === 0 ? (
              <p className="text-sm text-stone-500">Todavía no hay servicios pasados.</p>
            ) : (
              <ul className="tarjeta divide-y divide-stone-100 text-sm">
                {hist.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                    <span>
                      {fechaSimple(v.fecha)} · {v.sucursal} · <span className="text-stone-500">{v.servicio}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {v.estado === "cancelada" && <span className="text-xs text-red-700">{v.motivo_cancelacion}</span>}
                      <Estado estado={v.estado} porReprogramar={v.por_reprogramar} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="tarjeta p-4">
            <h2 className="subtitulo mb-3">Datos del cliente</h2>
            <Formulario accion={editarCliente} className="space-y-3">
              <input type="hidden" name="id" value={c.id} />
              <div>
                <label className="etiqueta" htmlFor="nombre">Nombre comercial *</label>
                <input id="nombre" name="nombre" required defaultValue={c.nombre} className="campo" />
              </div>
              <div>
                <label className="etiqueta" htmlFor="razon_social">Razón social (para facturar)</label>
                <input id="razon_social" name="razon_social" defaultValue={c.razon_social ?? ""} className="campo" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="etiqueta" htmlFor="rnc">RNC / Cédula</label>
                  <input id="rnc" name="rnc" defaultValue={c.rnc ?? ""} className="campo" />
                </div>
                <div>
                  <label className="etiqueta" htmlFor="telefono">Teléfono</label>
                  <input id="telefono" name="telefono" defaultValue={c.telefono ?? ""} className="campo" />
                </div>
              </div>
              <div>
                <label className="etiqueta" htmlFor="correo">Correo</label>
                <input id="correo" name="correo" type="email" defaultValue={c.correo ?? ""} className="campo" />
              </div>
              <div>
                <label className="etiqueta" htmlFor="notas">Notas</label>
                <textarea id="notas" name="notas" rows={2} defaultValue={c.notas ?? ""} className="campo" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="activo" defaultChecked={c.activo} /> Cliente activo
              </label>
              <BotonEnviar>Guardar</BotonEnviar>
            </Formulario>
          </section>

          <section className="tarjeta p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="subtitulo">Facturación</h2>
              <Link href={`/oficina/facturacion/nueva?cliente=${c.id}`} className="boton-sec boton-chico">Nueva factura</Link>
            </div>
            <Formulario accion={guardarFacturacionCliente} className="space-y-3">
              <input type="hidden" name="id" value={c.id} />
              <div>
                <label className="etiqueta" htmlFor="tipo_comprobante">Comprobante habitual</label>
                <select id="tipo_comprobante" name="tipo_comprobante" defaultValue={c.tipo_comprobante ?? ""} className="campo">
                  <option value="">Automático (B01 con RNC, B02 sin RNC)</option>
                  {tipos.map((t) => (
                    <option key={t.codigo} value={t.codigo}>{t.codigo} · {t.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="etiqueta" htmlFor="dias_credito">Días de crédito</label>
                  <input id="dias_credito" name="dias_credito" type="number" min={0} max={365} defaultValue={c.dias_credito ?? 0} className="campo" />
                </div>
                <div>
                  <label className="etiqueta" htmlFor="correo_facturas">Correo para facturas</label>
                  <input id="correo_facturas" name="correo_facturas" type="email" defaultValue={c.correo_facturas ?? ""} className="campo" />
                </div>
              </div>
              <div>
                <label className="etiqueta" htmlFor="moneda_cliente">Moneda en que se le factura</label>
                <select id="moneda_cliente" name="moneda" defaultValue={c.moneda ?? "DOP"} className="campo">
                  <option value="DOP">RD$ · Pesos dominicanos</option>
                  <option value="USD">US$ · Dólares</option>
                  <option value="EUR">€ · Euros</option>
                </select>
              </div>
              <div>
                <label className="etiqueta" htmlFor="limite_credito">Límite de crédito (vacío = sin límite)</label>
                <input id="limite_credito" name="limite_credito" inputMode="decimal" defaultValue={c.limite_credito ?? ""} className="campo" placeholder="Ej. 50000" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="exento_itbis" defaultChecked={!!c.exento_itbis} /> Exento de ITBIS
              </label>
              <Link href={`/oficina/cobros/cliente/${c.id}`} className="block text-[13px] font-semibold text-marca-600 hover:underline">Ver estado de cuenta →</Link>
              <BotonEnviar>Guardar</BotonEnviar>
            </Formulario>
            {facturas.length > 0 && (
              <ul className="mt-4 space-y-1 border-t border-stone-100 pt-3 text-sm">
                {facturas.map((f) => (
                  <li key={f.id} className="flex justify-between gap-2">
                    <Link href={`/oficina/facturacion/${f.id}`} className="text-marca-700 hover:underline">
                      {numeroDocumento(f)} <span className="text-stone-500">· {fechaSimple(f.fecha)}</span>
                    </Link>
                    <span className={`tabular-nums ${f.estado === "anulada" ? "text-stone-400 line-through" : ""}`}>{monto(f.total, f.moneda)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="tarjeta p-4">
            <h2 className="subtitulo mb-2">Garantías</h2>
            {gar.length === 0 ? (
              <p className="text-sm text-stone-500">Sin garantías registradas.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {gar.map((g) => (
                  <li key={g.id} className="flex justify-between gap-2">
                    <span>{g.sucursal} · <span className="text-stone-500">{g.servicio}</span></span>
                    <span className={g.vigente ? "text-marca-700" : "text-stone-400"}>
                      {g.vigente ? "vence" : "venció"} {fechaSimple(g.vence)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="tarjeta p-4">
            <h2 className="subtitulo mb-2">Borrar cliente</h2>
            <p className="mb-3 text-xs text-stone-500">
              Solo se puede borrar si no tiene servicios realizados. Si ya trabajaste con él, desactívalo para conservar el historial.
            </p>
            <Formulario accion={borrarCliente} confirmar={`¿Borrar a ${c.nombre} con todas sus sucursales y visitas programadas?`}>
              <input type="hidden" name="id" value={c.id} />
              <BotonEnviar className="boton-peligro" pendiente="Borrando…">Borrar cliente</BotonEnviar>
            </Formulario>
          </section>
        </aside>
      </div>
    </div>
  );
}
