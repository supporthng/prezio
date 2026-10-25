import { notFound } from "next/navigation";
import { cargarNegocio } from "@/lib/negocio";
import { normalizar } from "@/lib/apariencia";
import { Verificador } from "./Verificador";

export const metadata = { title: "Verificador" };

type Props = { params: Promise<{ slug: string; sucursal: string }> };

export default async function VerificadorPagina({ params }: Props) {
  const { slug, sucursal: codigo } = await params;
  const { supabase, negocio } = await cargarNegocio(slug, `/v/${slug}/${codigo}`);
  const { data } = await supabase.from("sucursales").select("id, nombre")
    .eq("negocio_id", negocio.id).eq("codigo", codigo).maybeSingle();
  const sucursal = data as { id: string; nombre: string } | null;
  if (!sucursal) notFound();
  return (
    <Verificador sucursalId={sucursal.id} sucursal={sucursal.nombre} negocio={negocio.nombre} slug={slug}
      apariencia={normalizar(negocio.apariencia)} moneda={negocio.moneda} />
  );
}
