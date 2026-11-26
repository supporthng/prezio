import { redirect } from "next/navigation";
import { Marca } from "@/components/Marca";
import { supabaseServidor } from "@/lib/supabase/server";
import { Verificar } from "./Verificar";

export const metadata = { title: "Plataforma · Verificación" };
export const dynamic = "force-dynamic";

/** Segundo paso de la Plataforma: el código de 6 dígitos de la app de autenticación (o configurarla la primera vez). */
type Props = { searchParams: Promise<{ siguiente?: string }> };

export default async function VerificarPlataforma({ searchParams }: Props) {
  // Único destino aceptado además del panel: elegir la clave nueva después del enlace del correo.
  const siguiente = (await searchParams).siguiente === "/plataforma/clave" ? "/plataforma/clave" : "/plataforma";
  const supabase = await supabaseServidor();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/plataforma/entrar");
  const { data: m } = await supabase.rpc("plataforma_miembro");
  if (!m) redirect("/plataforma/entrar?error=" + encodeURIComponent("Esta cuenta no es de la Plataforma de Prezcio."));
  if ((m as { verificado: boolean }).verificado) redirect(siguiente);
  const { data: f } = await supabase.auth.mfa.listFactors();
  const tiene = Boolean(f?.totp?.some((x) => x.status === "verified"));
  return (
    <main className="pe-fondo">
      <div className="pe-caja">
        <div className="pe-marca"><Marca claro /><span>Plataforma</span></div>
        <Verificar inscribir={!tiene} correo={auth.user.email ?? ""} siguiente={siguiente} />
        <form action="/salir" method="post" className="pe-pie">Solo para el equipo de Prezcio. <button type="submit" className="pe-salir">Salir</button></form>
      </div>
    </main>
  );
}
