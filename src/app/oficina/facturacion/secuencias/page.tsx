import type { Metadata } from "next";
import Link from "next/link";
import { BotonEnviar, Formulario } from "@/components/Formulario";
import { fechaSimple } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Secuencia, TipoComprobante } from "@/lib/tipos";
import { alternarSecuencia, crearSecuencia } from "../acciones";

export const metadata: Metadata = { title: "Secuencias de comprobantes" };

const CHIP: Record<Secuencia["estado"], { texto: string; clase: string }> = {
  vigente: { texto: "Vigente", clase: "bg-marca-50 text-marca-800" },
  por_agotarse: { texto: "Por agotarse", clase: "bg-amber-50 text-amber-800" },
  agotada: { texto: "Agotada", clase: "bg-stone-100 text-stone-600" },
  vencida: { texto: "Vencida", clase: "bg-red-50 text-red-700" },
  inactiva: { texto: "Inactiva", clase: "bg-stone-100 text-stone-500" },
};

export default async function Secuencias() {
  const supabase = await supabaseServidor();
  const [{ data }, { data: tiposData }] = await Promise.all([
    supabase.from("secuencias_estado").select("*").order("tipo").order("desde"),
    supabase.from("tipos_comprobante").select("*").order("codigo"),
  ]);
  const secuencias = (data ?? []) as Secuencia[];
  const tipos = (tiposData ?? []) as TipoComprobante[];

  return (
    <div className="space-y-5">
      <div>
        <Link href="/oficina/facturacion" className="text-sm text-marca-700 hover:underline">← Facturación</Link>
        <h1 className="titulo mt-1">Secuencias de comprobantes</h1>
        <p className="text-sm text-stone-500">
          Registra los rangos de NCF que te autorizó la DGII (Oficina Virtual → Solicitud de comprobantes). Fumio toma el
          siguiente número de forma automática al emitir.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="tarjeta overflow-x-auto">
          {secuencias.length === 0 ? (
            <p className="p-8 text-center text-sm text-stone-500">Todavía no hay secuencias. Registra la primera con el formulario.</p>
          ) : (
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-stone-50 text-left text-xs text-stone-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  <th className="px-4 py-2 font-medium">Rango</th>
                  <th className="px-4 py-2 text-right font-medium">Quedan</th>
                  <th className="px-4 py-2 font-medium">Vence</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {secuencias.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2">
                      <div className="font-medium">{s.tipo}</div>
                      <div className="text-xs text-stone-500">{s.nombre}</div>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {s.primero}
                      <br />
                      {s.ultimo}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.disponibles.toLocaleString("es-DO")}</td>
                    <td className="whitespace-nowrap px-4 py-2">{s.vence ? fechaSimple(s.vence) : "—"}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CHIP[s.estado].clase}`}>{CHIP[s.estado].texto}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Formulario accion={alternarSecuencia}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="activa" value={String(!s.activa)} />
                        <BotonEnviar className="boton-sec boton-chico" pendiente="…">{s.activa ? "Desactivar" : "Activar"}</BotonEnviar>
                      </Formulario>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <section className="tarjeta space-y-3 p-4">
          <h2 className="subtitulo">Registrar secuencia</h2>
          <Formulario accion={crearSecuencia} limpiar className="space-y-3">
            <div className="space-y-1">
              <label className="etiqueta" htmlFor="tipo">Tipo de comprobante</label>
              <select id="tipo" name="tipo" className="campo w-full" required defaultValue="">
                <option value="" disabled>Elige…</option>
                {(["B", "E"] as const).map((serie) => (
                  <optgroup key={serie} label={serie === "B" ? "Serie B" : "Serie E (electrónica)"}>
                    {tipos.filter((t) => t.serie === serie).map((t) => (
                      <option key={t.codigo} value={t.codigo}>{t.codigo} · {t.nombre}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="etiqueta" htmlFor="desde">Desde</label>
                <input id="desde" name="desde" className="campo w-full font-mono" placeholder="B0100000001" required />
              </div>
              <div className="space-y-1">
                <label className="etiqueta" htmlFor="hasta">Hasta</label>
                <input id="hasta" name="hasta" className="campo w-full font-mono" placeholder="B0100000500" required />
              </div>
            </div>
            <div className="space-y-1">
              <label className="etiqueta" htmlFor="siguiente">Próximo número a usar (opcional)</label>
              <input id="siguiente" name="siguiente" className="campo w-full font-mono" placeholder="Si ya usaste algunos a mano" />
            </div>
            <div className="space-y-1">
              <label className="etiqueta" htmlFor="vence">Fecha de vencimiento</label>
              <input id="vence" name="vence" type="date" className="campo w-full" />
              <p className="text-xs text-stone-500">La que indica la autorización de la DGII. Déjala vacía si no tiene.</p>
            </div>
            <BotonEnviar>Registrar</BotonEnviar>
          </Formulario>
        </section>
      </div>
    </div>
  );
}
