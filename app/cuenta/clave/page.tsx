import { EntradaMarco } from "@/components/EntradaMarco";
import { Aviso } from "@/components/Aviso";
import { cambiarClave } from "@/app/auth/actions";
import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/supabase/server";

export const metadata = { title: "Nueva clave" };

type Props = { searchParams: Promise<{ error?: string; nuevo?: string; siguiente?: string }> };

export default async function NuevaClave({ searchParams }: Props) {
  if (!(await usuarioActual())) redirect("/entrar?siguiente=/cuenta/clave");
  const { error, nuevo, siguiente } = await searchParams;
  return (
    <EntradaMarco>
      <h1>{nuevo ? "Bienvenido a Prezio" : "Elige una clave nueva"}</h1>
      {nuevo && <p className="quieto">Elige la clave con la que vas a entrar a tu negocio, aquí y en la app Prezio Administrador.</p>}
      <Aviso error={error} />
      <form action={cambiarClave}>
        <input type="hidden" name="siguiente" value={siguiente ?? ""} />
        <div className="campo">
          <label htmlFor="clave">Clave nueva (mínimo 8 caracteres)</label>
          <input id="clave" name="clave" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <button className="boton ancho" type="submit">Guardar clave</button>
      </form>
    </EntradaMarco>
  );
}
