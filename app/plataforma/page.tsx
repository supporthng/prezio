import { notFound, redirect } from "next/navigation";
import { Barra } from "@/components/Barra";
import { supabaseServidor } from "@/lib/supabase/server";
import { problemaClaveSecreta } from "@/lib/supabase/admin";
import { PanelPlataforma, type NegocioPl } from "./PanelPlataforma";
import type { Apps, DatosPl } from "./Vistas";
import apps from "@/public/apps.json";
import { sitio } from "@/lib/util";

export const metadata = { title: "Plataforma" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ bien?: string; error?: string; q?: string; vista?: string }> };

export default async function Plataforma({ searchParams }: Props) {
  const { bien, error, q, vista } = await searchParams;
  const supabase = await supabaseServidor();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/entrar?siguiente=/plataforma");
  const { data: es } = await supabase.rpc("es_plataforma");
  if (!es) notFound();
  const [{ data }, { data: datos }] = await Promise.all([supabase.rpc("plataforma_negocios"), supabase.rpc("plataforma_datos")]);
  const negocios = (data ?? []) as NegocioPl[];

  return (
    <>
      <Barra />
      <PanelPlataforma negocios={negocios} datos={datos as DatosPl} apps={apps as Apps} sitio={sitio()} vista={vista} ahora={Date.now()} error={error} bien={bien} claveProblema={problemaClaveSecreta()} q={q} />
    </>
  );
}
