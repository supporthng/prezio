import Link from "next/link";
import { EntradaMarco } from "@/components/EntradaMarco";
import { Aviso } from "@/components/Aviso";
import { entrar, recuperar } from "@/app/auth/actions";
import { rutaSegura } from "@/lib/util";

export const metadata = { title: "Entrar" };

type Props = { searchParams: Promise<{ error?: string; bien?: string; siguiente?: string }> };

export default async function Entrar({ searchParams }: Props) {
  const { error, bien, siguiente } = await searchParams;
  const sig = rutaSegura(siguiente);
  return (
    <EntradaMarco>
      <h1>Entra a Prezio</h1>
      <p className="quieto">Administra los precios y los verificadores de tu negocio.</p>
      <Aviso error={error} bien={bien} />
      <form action={entrar}>
        <input type="hidden" name="siguiente" value={sig} />
        <div className="campo">
          <label htmlFor="correo">Correo</label>
          <input id="correo" name="correo" type="email" autoComplete="email" required />
        </div>
        <div className="campo">
          <label htmlFor="clave">Clave</label>
          <input id="clave" name="clave" type="password" autoComplete="current-password" required />
        </div>
        <button className="boton ancho" type="submit">Entrar</button>
      </form>
      <p className="pequeno" style={{ marginTop: 20 }}>
        ¿No tienes cuenta? <Link href={`/registro?siguiente=${encodeURIComponent(sig)}`}>Crea una gratis</Link>
      </p>
      <details className="pequeno">
        <summary style={{ cursor: "pointer" }}>¿Olvidaste tu clave?</summary>
        <form action={recuperar} style={{ marginTop: 12 }}>
          <div className="campo">
            <label htmlFor="correo-r">Correo de tu cuenta</label>
            <input id="correo-r" name="correo" type="email" autoComplete="email" required />
          </div>
          <button className="boton secundario" type="submit">Enviarme un enlace</button>
        </form>
      </details>
    </EntradaMarco>
  );
}
