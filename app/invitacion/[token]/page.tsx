import Link from "next/link";
import { EntradaMarco } from "@/components/EntradaMarco";
import { Aviso } from "@/components/Aviso";
import { usuarioActual } from "@/lib/supabase/server";
import { aceptar } from "./actions";

export const metadata = { title: "Invitación" };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> };

export default async function Invitacion({ params, searchParams }: Props) {
  const { token } = await params;
  const { error } = await searchParams;
  const usuario = await usuarioActual();
  const aqui = `/invitacion/${encodeURIComponent(token)}`;
  if (!usuario) {
    return (
      <EntradaMarco>
        <h1>Te invitaron a un negocio en Prezio</h1>
        <p className="quieto">Entra o crea tu cuenta con el mismo correo al que te llegó la invitación.</p>
        <div className="fila">
          <Link className="boton" href={`/registro?siguiente=${encodeURIComponent(aqui)}`}>Crear cuenta</Link>
          <Link className="boton secundario" href={`/entrar?siguiente=${encodeURIComponent(aqui)}`}>Ya tengo cuenta</Link>
        </div>
      </EntradaMarco>
    );
  }
  return (
    <EntradaMarco>
      <h1>Aceptar la invitación</h1>
      <p className="quieto">Entrarás con la cuenta {usuario.email}.</p>
      <Aviso error={error} />
      <form action={aceptar}>
        <input type="hidden" name="token" value={token} />
        <button className="boton ancho" type="submit">Aceptar y entrar</button>
      </form>
    </EntradaMarco>
  );
}
