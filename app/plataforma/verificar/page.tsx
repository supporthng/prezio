import { redirect } from "next/navigation";
import { Marca } from "@/components/Marca";
import { supabaseServidor } from "@/lib/supabase/server";
import { Verificar } from "./Verificar";

export const metadata = { title: "Plataforma · Verificación" };
export const dynamic = "force-dynamic";

/** Segundo paso de la Plataforma: el código de 6 dígitos de la app de autenticación (o configurarla la primera vez). */
export default async function VerificarPlataforma() {
  const supabase = await supabaseServidor();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/plataforma/entrar");
  const { data: m } = await supabase.rpc("plataforma_miembro");
  if (!m) redirect("/plataforma/entrar?error=" + encodeURIComponent("Esta cuenta no es de la Plataforma de Prezcio."));
  if ((m as { verificado: boolean }).verificado) redirect("/plataforma");
  const { data: f } = await supabase.auth.mfa.listFactors();
  const tiene = Boolean(f?.totp?.some((x) => x.status === "verified"));
  return (
    <main className="pe-fondo">
      <div className="pe-caja">
        <div className="pe-marca"><Marca claro /><span>Plataforma</span></div>
        <Verificar inscribir={!tiene} correo={auth.user.email ?? ""} />
        <form action="/salir" method="post" className="pe-pie">Solo para el equipo de Prezcio. <button type="submit" className="pe-salir">Salir</button></form>
      </div>
    </main>
  );
}
