import { redirect } from "next/navigation";
import { Marca } from "@/components/Marca";
import { Aviso } from "@/components/Aviso";
import { supabaseServidor } from "@/lib/supabase/server";
import { cambiarClavePlataforma } from "../entrar/actions";

export const metadata = { title: "Plataforma · Clave nueva" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ error?: string }> };

/** Clave nueva de la Plataforma: se llega desde el enlace del correo y después del código de 2 pasos. */
export default async function ClavePlataforma({ searchParams }: Props) {
  const supabase = await supabaseServidor();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/plataforma/entrar?error=" + encodeURIComponent("El enlace venció o ya se usó. Pide otro."));
  const { data: m } = await supabase.rpc("plataforma_miembro");
  if (!m) redirect("/plataforma/entrar?error=" + encodeURIComponent("Esta cuenta no es de la Plataforma de Prezcio."));
  if (!(m as { verificado: boolean }).verificado) redirect("/plataforma/verificar?siguiente=/plataforma/clave");
  const { error } = await searchParams;
  return (
    <main className="pe-fondo">
      <div className="pe-caja">
        <div className="pe-marca"><Marca claro /><span>Plataforma</span></div>
        <section className="pe-tarjeta" aria-labelledby="pc-t">
          <h1 id="pc-t">Elige una clave nueva</h1>
          <p className="quieto">Cuenta: {auth.user.email}</p>
          <Aviso error={error} />
          <form action={cambiarClavePlataforma}>
            <div className="campo">
              <label htmlFor="pc-clave">Clave nueva (mínimo 8 caracteres)</label>
              <input id="pc-clave" name="clave" type="password" autoComplete="new-password" minLength={8} required autoFocus />
            </div>
            <div className="campo">
              <label htmlFor="pc-repite">Repite la clave</label>
              <input id="pc-repite" name="repite" type="password" autoComplete="new-password" minLength={8} required />
            </div>
            <button className="boton ancho" type="submit">Guardar clave</button>
          </form>
        </section>
        <p className="pe-pie">Solo para el equipo de Prezcio.</p>
      </div>
    </main>
  );
}
