import Link from "next/link";
import { Marca } from "./Marca";

/** Barra superior del panel: logotipo, negocio actual y salir. */
export function Barra({ negocio }: { negocio?: { nombre: string; slug: string } }) {
  return (
    <header className="barra">
      <nav>
        <Link href="/negocios" style={{ textDecoration: "none" }}><Marca tamano={24} /></Link>
        {negocio && <span className="chip">{negocio.nombre}</span>}
      </nav>
      <nav>
        {negocio && <Link className="boton secundario" href="/negocios">Cambiar de negocio</Link>}
        <form action="/salir" method="post">
          <button className="boton secundario" type="submit">Salir</button>
        </form>
      </nav>
    </header>
  );
}
