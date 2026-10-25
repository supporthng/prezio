import { Barra } from "@/components/Barra";
import { Aviso } from "@/components/Aviso";
import { crearNegocio } from "@/app/negocios/actions";

export const metadata = { title: "Crear negocio" };

type Props = { searchParams: Promise<{ error?: string }> };

export default async function NuevoNegocio({ searchParams }: Props) {
  const { error } = await searchParams;
  return (
    <>
      <Barra />
      <main className="contenido" style={{ maxWidth: 560 }}>
        <h1>Crear negocio</h1>
        <p className="quieto">Empiezas con 30 días de prueba y una sucursal Principal, que puedes renombrar.</p>
        <Aviso error={error} />
        <form action={crearNegocio} className="tarjeta">
          <div className="campo">
            <label htmlFor="nombre">Nombre del negocio</label>
            <input id="nombre" name="nombre" minLength={2} maxLength={80} placeholder="Ej.: Supermercado La Esquina" required />
          </div>
          <button className="boton" type="submit">Crear negocio</button>
        </form>
      </main>
    </>
  );
}
