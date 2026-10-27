import type { Metadata } from "next";
import Link from "next/link";
import { catalogos } from "@/lib/datos";
import { hoyRD } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { FormularioAgendar, type ClienteOpcion } from "./FormularioAgendar";

export const metadata: Metadata = { title: "Agendar servicio" };

export default async function Agendar() {
  const supabase = await supabaseServidor();
  const [cat, { data }] = await Promise.all([
    catalogos(),
    supabase
      .from("clientes")
      .select("id, nombre, razon_social, sucursales(id, nombre, direccion, servicio_id, tecnico_id, activa)")
      .eq("activo", true)
      .order("nombre"),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/oficina/rutas" className="text-sm text-marca-700 hover:underline">← Rutas</Link>
        <h1 className="titulo mt-1">Agendar servicio</h1>
        <p className="text-sm text-stone-500">
          Para una llamada o un trabajo fuera de la frecuencia. Entra directo en la ruta del día que elijas.
        </p>
      </div>
      <FormularioAgendar
        clientes={(data ?? []) as ClienteOpcion[]}
        servicios={cat.servicios.filter((s) => s.activo)}
        tecnicos={cat.tecnicos}
        regiones={cat.regiones}
        zonas={cat.zonas}
        hoy={hoyRD()}
      />
    </div>
  );
}
