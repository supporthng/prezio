import { Marca } from "@/components/Marca";
import { Aviso } from "@/components/Aviso";
import { entrarPlataforma, recuperarPlataforma } from "./actions";

export const metadata = { title: "Plataforma · Entrar" };

type Props = { searchParams: Promise<{ error?: string; bien?: string }> };

/** Entrada de la Plataforma (también la de la app de Windows «Prezcio Plataforma»): una tarjeta, sin el marco de los negocios. */
export default async function EntrarPlataforma({ searchParams }: Props) {
  const { error, bien } = await searchParams;
  return (
    <main className="pe-fondo">
      <div className="pe-caja">
        <div className="pe-marca"><Marca claro /><span>Plataforma</span></div>
        <section className="pe-tarjeta" aria-labelledby="pe-t">
          <h1 id="pe-t">Entrar a la Plataforma</h1>
          <p className="quieto">Negocios, licencias, pagos y planes.</p>
          <Aviso error={error} bien={bien} />
          <form action={entrarPlataforma}>
            <div className="campo">
              <label htmlFor="pe-correo">Correo</label>
              <input id="pe-correo" name="correo" type="email" autoComplete="username" required autoFocus />
            </div>
            <div className="campo">
              <label htmlFor="pe-clave">Clave</label>
              <input id="pe-clave" name="clave" type="password" autoComplete="current-password" required />
            </div>
            <button className="boton ancho" type="submit">Entrar</button>
          </form>
          <details className="pe-olvido">
            <summary>¿Olvidaste tu clave?</summary>
            <form action={recuperarPlataforma}>
              <div className="campo">
                <label htmlFor="pe-correo-r">Correo de tu cuenta</label>
                <input id="pe-correo-r" name="correo" type="email" autoComplete="email" required />
              </div>
              <button className="boton secundario ancho" type="submit">Enviarme un enlace</button>
              <p className="quieto pequeno">Te llega un enlace al correo. Al abrirlo te pedimos el código de verificación y luego eliges la clave nueva.</p>
            </form>
          </details>
        </section>
        <p className="pe-pie">Solo para el equipo de Prezcio. Los negocios entran por su propio enlace.</p>
      </div>
    </main>
  );
}
