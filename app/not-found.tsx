import Link from "next/link";
import { EntradaMarco } from "@/components/EntradaMarco";
import { supabaseServidor } from "@/lib/supabase/server";

export default async function NoEncontrado() {
  const supabase = await supabaseServidor();
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  const quien = !u ? null
    : u.email?.endsWith(".prezio.invalid") ? `el usuario «${String(u.user_metadata?.usuario ?? "")}»` : u.email;
  return (
    <EntradaMarco>
      <h1>No encontramos esta página</h1>
      <p className="quieto">Puede que no exista o que tu cuenta no tenga acceso a ese negocio.</p>
      {quien && (
        <p className="quieto">
          Entraste como <b>{quien}</b>. Si este negocio es de otra cuenta (por ejemplo, un dueño que entra con usuario y clave),
          sal y entra con esa cuenta.
        </p>
      )}
      <div className="fila">
        {u ? (
          <form action="/salir?siguiente=/entrar" method="post"><button className="boton" type="submit">Entrar con otra cuenta</button></form>
        ) : (
          <Link className="boton" href="/entrar">Entrar</Link>
        )}
        {u && <Link className="boton secundario" href="/negocios">Ir a tus negocios</Link>}
      </div>
    </EntradaMarco>
  );
}
