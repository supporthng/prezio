import type { Metadata } from "next";
import Link from "next/link";
import { BotonEnviar, Formulario } from "@/components/Formulario";
import { exigirOficina } from "@/lib/auth";
import { catalogos } from "@/lib/datos";
import { dinero, etiquetaRol } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Empresa, Producto } from "@/lib/tipos";
import {
  alternarMotivo,
  crearProducto,
  editarProducto,
  guardarEmpresa,
  borrarRegion,
  borrarZona,
  crearMotivo,
  crearRegion,
  crearServicio,
  crearUsuario,
  crearZona,
  editarServicio,
  editarUsuario,
} from "../acciones";

export const metadata: Metadata = { title: "Ajustes" };

export default async function Ajustes() {
  const yo = await exigirOficina();
  const supabase = await supabaseServidor();
  const [cat, { data: empresaDatos }] = await Promise.all([catalogos(), supabase.from("empresa").select("*").eq("id", 1).maybeSingle()]);
  const empresa = (empresaDatos ?? {}) as Partial<Empresa>;
  const esAdmin = yo.rol === "admin";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="titulo">Ajustes</h1>
        <p className="text-sm text-stone-500">Catálogo de servicios, regiones y zonas, motivos de cancelación y usuarios.</p>
      </div>

      {/* EMPRESA */}
      <section className="space-y-3">
        <h2 className="subtitulo">Datos de la empresa</h2>
        <p className="text-xs text-stone-500">Salen en el encabezado de la constancia de servicio que recibe el cliente.</p>
        <Formulario accion={guardarEmpresa} className="tarjeta grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="etiqueta" htmlFor="emp-nombre">Nombre de la empresa *</label>
            <input id="emp-nombre" name="nombre" required defaultValue={empresa.nombre ?? ""} className="campo" />
          </div>
          <div>
            <label className="etiqueta" htmlFor="emp-rnc">RNC</label>
            <input id="emp-rnc" name="rnc" defaultValue={empresa.rnc ?? ""} className="campo" />
          </div>
          <div>
            <label className="etiqueta" htmlFor="emp-licencia">Licencia / permiso sanitario</label>
            <input id="emp-licencia" name="licencia" defaultValue={empresa.licencia ?? ""} className="campo" />
          </div>
          <div>
            <label className="etiqueta" htmlFor="emp-tel">Teléfono</label>
            <input id="emp-tel" name="telefono" defaultValue={empresa.telefono ?? ""} className="campo" />
          </div>
          <div>
            <label className="etiqueta" htmlFor="emp-wa">WhatsApp</label>
            <input id="emp-wa" name="whatsapp" defaultValue={empresa.whatsapp ?? ""} className="campo" />
          </div>
          <div className="sm:col-span-2">
            <label className="etiqueta" htmlFor="emp-correo">Correo</label>
            <input id="emp-correo" name="correo" type="email" defaultValue={empresa.correo ?? ""} className="campo" />
          </div>
          <div className="sm:col-span-2">
            <label className="etiqueta" htmlFor="emp-dir">Dirección</label>
            <input id="emp-dir" name="direccion" defaultValue={empresa.direccion ?? ""} className="campo" />
          </div>
          <div className="sm:col-span-2">
            <label className="etiqueta" htmlFor="emp-pie">Texto al pie de la constancia</label>
            <input id="emp-pie" name="pie_constancia" defaultValue={empresa.pie_constancia ?? ""} className="campo" placeholder="Ej. Mantener el área ventilada por 2 horas." />
          </div>
          <div className="sm:col-span-2">
            <label className="etiqueta" htmlFor="emp-ticket">Mensaje al final del ticket</label>
            <input id="emp-ticket" name="mensaje_ticket" defaultValue={empresa.mensaje_ticket ?? ""} className="campo" placeholder="Ej. ¡Gracias por preferirnos! Garantía de 30 días." />
          </div>
          <label className="col-span-full flex items-start gap-3 rounded-xl bg-stone-50 p-3 text-sm">
            <input type="checkbox" name="bloquear_credito" defaultChecked={!!empresa.bloquear_credito} className="mt-0.5 h-4 w-4 accent-marca-600" />
            <span>
              <b>No vender a crédito a quien pase su límite o tenga facturas vencidas</b>
              <span className="block text-xs text-stone-500">Si está apagado, Fumio solo avisa y deja seguir.</span>
            </span>
          </label>
          <div className="col-span-full">
            <BotonEnviar>Guardar datos de la empresa</BotonEnviar>
          </div>
        </Formulario>
      </section>

      {/* SERVICIOS */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="subtitulo">Catálogo de servicios</h2>
          <Link href="/oficina/importar?tipo=servicios" className="boton-sec boton-chico">Importar desde Excel</Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {cat.servicios.map((s) => (
            <details key={s.id} className={`tarjeta p-4 ${s.activo ? "" : "opacity-60"}`}>
              <summary className="flex cursor-pointer list-none items-start justify-between gap-2">
                <span>
                  <span className="font-medium text-stone-900">{s.nombre}</span>
                  {!s.activo && <span className="ml-2 text-xs text-stone-400">inactivo</span>}
                  <span className="block text-xs text-stone-500">
                    {dinero(s.precio_base)} · {s.garantia_meses ? `Garantía ${textoMeses(s.garantia_meses)}` : "Sin garantía"}
                  </span>
                </span>
                <span className="boton-sec boton-chico">Editar</span>
              </summary>
              <Formulario accion={editarServicio} className="mt-4 space-y-3 border-t border-stone-100 pt-4">
                <input type="hidden" name="id" value={s.id} />
                <CamposServicio s={s} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="activo" defaultChecked={s.activo} /> Activo
                </label>
                <BotonEnviar>Guardar</BotonEnviar>
              </Formulario>
            </details>
          ))}
          <div className="tarjeta border-dashed p-4">
            <h3 className="mb-3 text-sm font-medium">Nuevo servicio</h3>
            <Formulario accion={crearServicio} limpiar className="space-y-3">
              <CamposServicio />
              <BotonEnviar>Agregar servicio</BotonEnviar>
            </Formulario>
          </div>
        </div>
      </section>

      {/* PRODUCTOS */}
      <section id="productos" className="scroll-mt-6 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="subtitulo">Productos (químicos e insumos)</h2>
          <Link href="/oficina/importar?tipo=productos" className="boton-sec boton-chico">Importar desde Excel</Link>
        </div>
        <datalist id="unidades">
          {["ml", "L", "g", "kg", "unidades", "sobres", "cebos"].map((u) => <option key={u} value={u} />)}
        </datalist>
        <p className="text-xs text-stone-500">El técnico elige de esta lista los productos aplicados en cada servicio. Salen en la constancia.</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cat.productos.map((p) => (
            <details key={p.id} className={`tarjeta p-4 ${p.activo ? "" : "opacity-60"}`}>
              <summary className="flex cursor-pointer list-none items-start justify-between gap-2">
                <span>
                  <span className="font-medium text-stone-900">{p.nombre}</span>
                  {!p.activo && <span className="ml-2 text-xs text-stone-400">inactivo</span>}
                  <span className="block text-xs text-stone-500">{p.ingrediente_activo ?? "—"} · {p.unidad}</span>
                </span>
                <span className="boton-sec boton-chico">Editar</span>
              </summary>
              <Formulario accion={editarProducto} className="mt-4 space-y-3 border-t border-stone-100 pt-4">
                <input type="hidden" name="id" value={p.id} />
                <CamposProducto p={p} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="activo" defaultChecked={p.activo} /> Activo
                </label>
                <BotonEnviar>Guardar</BotonEnviar>
              </Formulario>
            </details>
          ))}
          <div className="tarjeta border-dashed p-4">
            <h3 className="mb-3 text-sm font-medium">Nuevo producto</h3>
            <Formulario accion={crearProducto} limpiar className="space-y-3">
              <CamposProducto />
              <BotonEnviar>Agregar producto</BotonEnviar>
            </Formulario>
          </div>
        </div>
      </section>

      {/* REGIONES Y ZONAS */}
      <section className="space-y-3">
        <h2 className="subtitulo">Regiones y zonas</h2>
        <p className="text-xs text-stone-500">Las rutas se filtran por región. Cada sucursal se ubica en una zona.</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cat.regiones.map((r) => {
            const zonas = cat.zonas.filter((z) => z.region_id === r.id);
            return (
              <div key={r.id} className="tarjeta space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{r.nombre}</h3>
                  <Formulario accion={borrarRegion} confirmar={`¿Borrar la región ${r.nombre} y sus zonas?`}>
                    <input type="hidden" name="id" value={r.id} />
                    <BotonEnviar className="text-xs text-red-600 hover:underline" pendiente="…">Borrar</BotonEnviar>
                  </Formulario>
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {zonas.length === 0 && <li className="text-xs text-stone-400">Sin zonas</li>}
                  {zonas.map((z) => (
                    <li key={z.id}>
                      <Formulario accion={borrarZona} confirmar={`¿Borrar la zona ${z.nombre}?`}>
                        <input type="hidden" name="id" value={z.id} />
                        <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 py-0.5 pl-2.5 pr-1 text-xs">
                          {z.nombre}
                          <BotonEnviar className="rounded-full px-1 text-stone-400 hover:bg-stone-200 hover:text-red-600" pendiente="…">
                            <span aria-label={`Borrar ${z.nombre}`}>×</span>
                          </BotonEnviar>
                        </span>
                      </Formulario>
                    </li>
                  ))}
                </ul>
                <Formulario accion={crearZona} limpiar className="flex gap-2">
                  <input type="hidden" name="region" value={r.id} />
                  <input name="nombre" placeholder="Nueva zona" className="campo" required aria-label={`Nueva zona en ${r.nombre}`} />
                  <BotonEnviar className="boton-sec" pendiente="…">Agregar</BotonEnviar>
                </Formulario>
              </div>
            );
          })}
          <div className="tarjeta border-dashed p-4">
            <h3 className="mb-3 text-sm font-medium">Nueva región</h3>
            <Formulario accion={crearRegion} limpiar className="flex gap-2">
              <input name="nombre" placeholder="Ej. Cibao" className="campo" required aria-label="Nombre de la región" />
              <BotonEnviar className="boton-sec" pendiente="…">Agregar</BotonEnviar>
            </Formulario>
          </div>
        </div>
      </section>

      {/* MOTIVOS */}
      <section className="space-y-3">
        <h2 className="subtitulo">Motivos de cancelación</h2>
        <div className="tarjeta p-4">
          <ul className="mb-4 flex flex-wrap gap-2">
            {cat.motivos.map((m) => (
              <li key={m.id}>
                <Formulario accion={alternarMotivo}>
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="activo" value={String(!m.activo)} />
                  <BotonEnviar
                    className={`rounded-full px-3 py-1 text-xs ring-1 ${
                      m.activo ? "bg-white text-stone-700 ring-stone-300 hover:bg-stone-50" : "bg-stone-100 text-stone-400 line-through ring-stone-200"
                    }`}
                    pendiente="…"
                  >
                    <span title={m.activo ? "Clic para ocultar" : "Clic para volver a usar"}>{m.nombre}</span>
                  </BotonEnviar>
                </Formulario>
              </li>
            ))}
          </ul>
          <Formulario accion={crearMotivo} limpiar className="flex max-w-md gap-2">
            <input name="nombre" placeholder="Nuevo motivo" className="campo" required aria-label="Nuevo motivo" />
            <BotonEnviar className="boton-sec" pendiente="…">Agregar</BotonEnviar>
          </Formulario>
          <p className="mt-2 text-xs text-stone-500">Haz clic en un motivo para ocultarlo o volver a usarlo. Los tachados no aparecen al cancelar.</p>
        </div>
      </section>

      {/* USUARIOS */}
      <section className="space-y-3">
        <h2 className="subtitulo">Usuarios</h2>
        <p className="text-xs text-stone-500">
          <b>Técnico:</b> ve solo sus visitas en el celular. <b>Oficina:</b> maneja clientes, rutas y ajustes.{" "}
          <b>Administrador:</b> además crea usuarios.
        </p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cat.usuarios.map((u) => (
            <div key={u.id} className={`tarjeta p-4 ${u.activo ? "" : "opacity-60"}`}>
              {esAdmin ? (
                <Formulario accion={editarUsuario} className="space-y-2">
                  <input type="hidden" name="id" value={u.id} />
                  <input name="nombre" defaultValue={u.nombre} className="campo font-medium" aria-label="Nombre" required />
                  <div className="text-xs text-stone-500">{u.correo}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <select name="rol" defaultValue={u.rol} className="campo" aria-label="Rol">
                      <option value="tecnico">Técnico</option>
                      <option value="oficina">Oficina</option>
                      <option value="admin">Administrador</option>
                    </select>
                    <input name="telefono" defaultValue={u.telefono ?? ""} placeholder="Teléfono" className="campo" aria-label="Teléfono" />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="activo" defaultChecked={u.activo} /> Activo
                    </label>
                    <BotonEnviar className="boton-sec boton-chico">Guardar</BotonEnviar>
                  </div>
                </Formulario>
              ) : (
                <div>
                  <div className="font-medium">{u.nombre}</div>
                  <div className="text-xs text-stone-500">{u.correo} · {etiquetaRol(u.rol)}{u.activo ? "" : " · inactivo"}</div>
                </div>
              )}
            </div>
          ))}
          {esAdmin && (
            <div className="tarjeta border-dashed p-4">
              <h3 className="mb-3 text-sm font-medium">Nuevo usuario</h3>
              <Formulario accion={crearUsuario} limpiar className="space-y-2">
                <input name="nombre" placeholder="Nombre" className="campo" required aria-label="Nombre" />
                <input name="correo" type="email" placeholder="Correo" className="campo" required aria-label="Correo" />
                <input name="clave" type="text" placeholder="Contraseña (mínimo 8)" className="campo" required minLength={8} aria-label="Contraseña" autoComplete="new-password" />
                <div className="grid grid-cols-2 gap-2">
                  <select name="rol" defaultValue="tecnico" className="campo" aria-label="Rol">
                    <option value="tecnico">Técnico</option>
                    <option value="oficina">Oficina</option>
                    <option value="admin">Administrador</option>
                  </select>
                  <input name="telefono" placeholder="Teléfono" className="campo" aria-label="Teléfono" />
                </div>
                <BotonEnviar>Crear usuario</BotonEnviar>
              </Formulario>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function CamposProducto({ p }: { p?: Producto }) {
  const id = (k: string) => `prod-${k}-${p?.id ?? "nuevo"}`;
  return (
    <>
      <div>
        <label className="etiqueta" htmlFor={id("nombre")}>Nombre comercial *</label>
        <input id={id("nombre")} name="nombre" required defaultValue={p?.nombre} className="campo" placeholder="Demand CS" />
      </div>
      <div>
        <label className="etiqueta" htmlFor={id("ingr")}>Ingrediente activo</label>
        <input id={id("ingr")} name="ingrediente_activo" defaultValue={p?.ingrediente_activo ?? ""} className="campo" placeholder="Lambda-cialotrina 9.7%" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="etiqueta" htmlFor={id("unidad")}>Unidad</label>
          <input id={id("unidad")} name="unidad" defaultValue={p?.unidad ?? "ml"} className="campo" list="unidades" />
        </div>
        <div>
          <label className="etiqueta" htmlFor={id("reg")}>Registro</label>
          <input id={id("reg")} name="registro" defaultValue={p?.registro ?? ""} className="campo" />
        </div>
      </div>
    </>
  );
}

function textoMeses(m: number) {
  if (m % 12 === 0) return `${m / 12} año${m === 12 ? "" : "s"}`;
  return `${m} mes${m === 1 ? "" : "es"}`;
}

function CamposServicio({ s }: { s?: { id: string; nombre: string; precio_base: number; garantia_meses: number | null; instrucciones: string | null } }) {
  const id = (k: string) => `${k}-${s?.id ?? "nuevo"}`;
  return (
    <>
      <div>
        <label className="etiqueta" htmlFor={id("nombre")}>Nombre *</label>
        <input id={id("nombre")} name="nombre" required defaultValue={s?.nombre} className="campo" placeholder="Termitas: perforación" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="etiqueta" htmlFor={id("precio")}>Precio base (RD$)</label>
          <input id={id("precio")} name="precio_base" inputMode="decimal" defaultValue={s?.precio_base ?? ""} className="campo" />
        </div>
        <div>
          <label className="etiqueta" htmlFor={id("garantia")}>Garantía (meses)</label>
          <input id={id("garantia")} name="garantia_meses" type="number" min={1} defaultValue={s?.garantia_meses ?? ""} className="campo" placeholder="Vacío = sin garantía" />
        </div>
      </div>
      <div>
        <label className="etiqueta" htmlFor={id("instr")}>Instrucciones de preparación para el cliente</label>
        <textarea id={id("instr")} name="instrucciones" rows={3} defaultValue={s?.instrucciones ?? ""} className="campo" placeholder="Retirar alimentos expuestos, guardar utensilios…" />
      </div>
    </>
  );
}
