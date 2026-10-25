import { EntradaMarco } from "@/components/EntradaMarco";
import { Aviso } from "@/components/Aviso";
import { cambiarClave } from "@/app/auth/actions";
import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/supabase/server";

export const metadata = { title: "Nueva clave" };

type Props = { searchParams: Promise<{ error?: string }> };

export default async function NuevaClave({ searchParams }: Props) {
  if (!(await usuarioActual())) redirect("/entrar?siguiente=/cuenta/clave");
  const { error } = await searchParams;
  return (
    <EntradaMarco>
      <h1>Elige una clave nueva</h1>
      <Aviso error={error} />
      <form action={cambiarClave}>
        <div className="campo">
          <label htmlFor="clave">Clave nueva (mínimo 8 caracteres)</label>
          <input id="clave" name="clave" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <button className="boton ancho" type="submit">Guardar clave</button>
      </form>
    </EntradaMarco>
  );
}
