import { Marca } from "./Marca";

/** Marco de las páginas de cuenta: la marca con la etiqueta a la izquierda y el formulario a la derecha. */
export function EntradaMarco({ children }: { children: React.ReactNode }) {
  return (
    <main className="entrada">
      <section className="entrada-marca">
        <Marca claro />
        <div className="muestra" aria-hidden="true">
          <div className="producto">Arroz Selecto 5 lb</div>
          <div className="precio"><small>RD$</small>245.00</div>
          <div className="codigo">7 46085 52302 7</div>
        </div>
        <p className="lema">El cliente escanea y ve el precio al instante, en todas tus sucursales, aunque se caiga el internet.</p>
      </section>
      <section className="entrada-form">
        <div>{children}</div>
      </section>
    </main>
  );
}
