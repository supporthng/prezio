import Link from "next/link";
import { EntradaMarco } from "@/components/EntradaMarco";
import { Aviso } from "@/components/Aviso";
import { cookies, headers } from "next/headers";
import { dominioBase, subdominioDe } from "@/lib/subdominio";
import { entrar, entrarConUsuario, recuperar } from "@/app/auth/actions";
import { rutaSegura, sitio } from "@/lib/util";
import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/supabase/server";

export const metadata = { title: "Entrar" };

type Props = { searchParams: Promise<{ error?: string; bien?: string; siguiente?: string; modo?: string; negocio?: string; otro?: string }> };

export default async function Entrar({ searchParams }: Props) {
  const { error, bien, siguiente, modo, negocio, otro } = await searchParams;
  const sig = rutaSegura(siguiente);
  // Ya dentro: directo a su negocio (o a donde iba), sin pasar por esta página.
  if (!error && !bien && !otro && await usuarioActual()) redirect(siguiente ? sig : "/negocios");
  // En la dirección propia del negocio (onetech.prezcio.app) el negocio ya se sabe: no se pide la licencia.
  const host = (await headers()).get("host") ?? "";
  const delHost = subdominioDe(host, dominioBase(sitio() || "https://prezcio.app")) ?? "";
  const guardado = otro ? "" : ((await cookies()).get("prezio_negocio")?.value ?? "");
  const recordado = delHost || guardado;
  // El negocio ya conocido no se muestra (ni la licencia): solo su nombre corto, con opción de cambiarlo.
  const fijo = !negocio && Boolean(recordado);
  // Con usuario si lo pidió o si en este navegador ya entró así antes.
  const conUsuario = modo === "usuario" || (modo !== "correo" && Boolean(recordado));
  const pestana = (m: string) => `/entrar?modo=${m}${siguiente ? `&siguiente=${encodeURIComponent(sig)}` : ""}`;
  return (
    <EntradaMarco>
      <h1>Entra a Prezcio</h1>
      <p className="quieto">Administra los precios y los verificadores de tu negocio.</p>
      <Aviso error={error} bien={bien} />
      <nav className="pestanas" aria-label="Forma de entrar">
        <Link href={pestana("usuario")} aria-current={conUsuario ? "page" : undefined}>Con usuario</Link>
        <Link href={pestana("correo")} aria-current={!conUsuario ? "page" : undefined}>Con correo</Link>
      </nav>
      {conUsuario ? (
        <form action={entrarConUsuario}>
          <input type="hidden" name="siguiente" value={siguiente ? sig : ""} />
          {fijo ? (
            <p className="negocio-fijo">
              <input type="hidden" name="negocio" value={recordado} />
              Negocio: <b>{/^PREZCIO-/i.test(recordado) ? "el de este equipo" : recordado.toUpperCase()}</b>
              {!delHost && <> · <Link href={`/entrar?modo=usuario&otro=1${siguiente ? `&siguiente=${encodeURIComponent(sig)}` : ""}`}>Otro negocio</Link></>}
            </p>
          ) : (
            <div className="campo">
              <label htmlFor="negocio">Licencia del negocio</label>
              <input id="negocio" name="negocio" defaultValue={negocio ?? ""} autoComplete="off" required
                autoCapitalize="characters" spellCheck={false} placeholder="PREZCIO-XXXX-XXXX-XXXX" />
            </div>
          )}
          <div className="campo">
            <label htmlFor="usuario">Usuario</label>
            <input id="usuario" name="usuario" autoComplete="username" required autoCapitalize="none" spellCheck={false} />
          </div>
          <div className="campo">
            <label htmlFor="clave-u">Clave</label>
            <input id="clave-u" name="clave" type="password" autoComplete="current-password" required />
          </div>
          <button className="boton ancho" type="submit">Entrar</button>
          <p className="quieto pequeno">El usuario y la clave te los da el dueño del negocio. Si olvidaste la clave, pídele que la cambie.</p>
        </form>
      ) : (
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
      )}
      <p className="pequeno" style={{ marginTop: 20 }}>
        ¿No tienes acceso? Pídelo a quien administra Prezcio en tu negocio.
      </p>
      {!conUsuario && <details className="pequeno">
        <summary style={{ cursor: "pointer" }}>¿Olvidaste tu clave?</summary>
        <form action={recuperar} style={{ marginTop: 12 }}>
          <div className="campo">
            <label htmlFor="correo-r">Correo de tu cuenta</label>
            <input id="correo-r" name="correo" type="email" autoComplete="email" required />
          </div>
          <button className="boton secundario" type="submit">Enviarme un enlace</button>
        </form>
      </details>}
    </EntradaMarco>
  );
}
