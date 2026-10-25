import Link from "next/link";
import { EntradaMarco } from "@/components/EntradaMarco";
import { Aviso } from "@/components/Aviso";
import { registrarse } from "@/app/auth/actions";
import { rutaSegura } from "@/lib/util";

export const metadata = { title: "Crear cuenta" };

type Props = { searchParams: Promise<{ error?: string; enviado?: string; siguiente?: string }> };

export default async function Registro({ searchParams }: Props) {
  const { error, enviado, siguiente } = await searchParams;
  const sig = rutaSegura(siguiente);
  if (enviado) {
    return (
      <EntradaMarco>
        <h1>Revisa tu correo</h1>
        <p>Te enviamos un enlace para confirmar tu cuenta. Ábrelo desde este mismo equipo y entrarás directo.</p>
        <p className="quieto pequeno">¿No llegó? Revisa la carpeta de correo no deseado o espera un minuto.</p>
        <Link className="boton secundario" href="/entrar">Volver a entrar</Link>
      </EntradaMarco>
    );
  }
  return (
    <EntradaMarco>
      <h1>Crea tu cuenta</h1>
      <p className="quieto">30 días de prueba con todas las funciones. Sin tarjeta.</p>
      <Aviso error={error} />
      <form action={registrarse}>
        <input type="hidden" name="siguiente" value={sig} />
        <div className="campo">
          <label htmlFor="nombre">Tu nombre</label>
          <input id="nombre" name="nombre" autoComplete="name" maxLength={80} required />
        </div>
        <div className="campo">
          <label htmlFor="correo">Correo</label>
          <input id="correo" name="correo" type="email" autoComplete="email" required />
        </div>
        <div className="campo">
          <label htmlFor="clave">Clave (mínimo 8 caracteres)</label>
          <input id="clave" name="clave" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <button className="boton ancho" type="submit">Crear cuenta</button>
      </form>
      <p className="pequeno" style={{ marginTop: 20 }}>
        ¿Ya tienes cuenta? <Link href={`/entrar?siguiente=${encodeURIComponent(sig)}`}>Entra</Link>
      </p>
    </EntradaMarco>
  );
}
