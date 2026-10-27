import { notFound, redirect } from "next/navigation";
import { Barra } from "@/components/Barra";
import { supabaseServidor } from "@/lib/supabase/server";
import { problemaClaveSecreta } from "@/lib/supabase/admin";
import { PanelPlataforma, type NegocioPl } from "./PanelPlataforma";

export const metadata = { title: "Plataforma" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ bien?: string; error?: string; q?: string }> };

export default async function Plataforma({ searchParams }: Props) {
  const { bien, error, q } = await searchParams;
  const supabase = await supabaseServidor();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/entrar?siguiente=/plataforma");
  const { data: es } = await supabase.rpc("es_plataforma");
  if (!es) notFound();
  const { data } = await supabase.rpc("plataforma_negocios");
  const negocios = (data ?? []) as NegocioPl[];

  return (
    <>
      <Barra />
      <PanelPlataforma negocios={negocios} ahora={Date.now()} error={error} bien={bien} claveProblema={problemaClaveSecreta()} q={q} />
    </>
  );
}
