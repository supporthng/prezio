import { Marca } from "@/components/Marca";
import { Aviso } from "@/components/Aviso";
import { entrarPlataforma } from "./actions";

export const metadata = { title: "Plataforma · Entrar" };

type Props = { searchParams: Promise<{ error?: string }> };

/** Entrada de la Plataforma (también la de la app de Windows «Prezcio Plataforma»): una tarjeta, sin el marco de los negocios. */
export default async function EntrarPlataforma({ searchParams }: Props) {
  const { error } = await searchParams;
  return (
    <main className="pe-fondo">
      <div className="pe-caja">
        <div className="pe-marca"><Marca claro /><span>Plataforma</span></div>
        <section className="pe-tarjeta" aria-labelledby="pe-t">
          <h1 id="pe-t">Entrar a la Plataforma</h1>
          <p className="quieto">Negocios, licencias, pagos y planes.</p>
          <Aviso error={error} />
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
        </section>
        <p className="pe-pie">Solo para el equipo de Prezcio. Los negocios entran por su propio enlace.</p>
      </div>
    </main>
  );
}
