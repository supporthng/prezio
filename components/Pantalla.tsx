"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { variables, type Apariencia } from "@/lib/apariencia";
import { cuandoOferta, precioConOferta, textoOferta, type Oferta, type OfertaProducto } from "@/lib/ofertas";

export type EstadoPantalla =
  | { tipo: "espera" }
  | { tipo: "suspendido" }
  | { tipo: "buscando"; codigo: string }
  | { tipo: "no"; codigo: string }
  | { tipo: "sin_fuente"; codigo: string }
  | { tipo: "producto"; codigo: string; nombre: string; precio: number; vez: number;
      /** En oferta: «precio» ya es el de oferta y «antes» el normal (si la oferta baja el precio). */
      oferta?: OfertaProducto & { antes?: number } };

type Props = {
  apariencia: Apariencia;
  moneda: string;
  negocio: string;
  sucursal?: string | null;
  estado: EstadoPantalla;
  vistaPrevia?: boolean;
  /** Ofertas vigentes: en espera se muestran al lado del lector. */
  ofertas?: Oferta[];
  children?: React.ReactNode;
};

const formato = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** La pantalla que ve el cliente: espera con láser, precio grande como en la etiqueta, o «no encontrado». */
/** Carrusel de ofertas: pasa solo cada N segundos y también con el dedo. */
function Carrusel({ ofertas, titulo, segundos, moneda }: { ofertas: Oferta[]; titulo: string; segundos: number; moneda: string }) {
  const [i, setI] = useState(0);
  const x0 = useRef<number | null>(null);
  const n = ofertas.length;
  const actual = i % n;
  useEffect(() => {
    if (n < 2) return;
    const t = setTimeout(() => setI((v) => (v + 1) % n), segundos * 1000);
    return () => clearTimeout(t);
  }, [i, n, segundos]);
  const ir = (paso: number) => setI((v) => (v + paso + n) % n);
  return (
    <section className="pz-ofertas" aria-label={titulo}
      onPointerDown={(e) => { x0.current = e.clientX; }}
      onPointerUp={(e) => { if (x0.current !== null && Math.abs(e.clientX - x0.current) > 40) ir(e.clientX < x0.current ? 1 : -1); x0.current = null; }}>
      <h2 className="pz-ofertas-titulo">{titulo}</h2>
      <div className="pz-carrusel">
        {ofertas.map((o, k) => {
          const cuando = cuandoOferta(o);
          const prods = o.productos.slice(0, o.imagen ? 2 : 3);
          return (
            <article key={o.id} className={`pz-oferta${k === actual ? " on" : ""}${o.imagen ? " con-imagen" : ""}`} aria-hidden={k !== actual}>
              {o.imagen && <img className="pz-oferta-img" src={o.imagen} alt="" />}
              <div className="pz-oferta-texto">
                {o.tipo !== "precio" && o.tipo !== "aviso" && <span className="pz-oferta-sello">{textoOferta(o)}</span>}
                <h3>{o.nombre}</h3>
                {o.descripcion && <p className="pz-oferta-desc">{o.descripcion}</p>}
                {prods.length > 0 && (
                  <ul className="pz-oferta-prods">
                    {prods.map(([cod, nombre, precio, especial]) => {
                      const p = Number(precio);
                      const ahora = precioConOferta(o, p, especial);
                      return (
                        <li key={cod}>
                          <span className="pz-op-nombre">{nombre}</span>
                          {ahora !== null ? (
                            <span className="pz-op-precios"><s>{moneda} {formato.format(p)}</s><b>{moneda} {formato.format(ahora)}</b></span>
                          ) : <span className="pz-op-precios"><b>{moneda} {formato.format(p)}</b></span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {o.productos.length > prods.length && <p className="pz-oferta-mas">y {o.productos.length - prods.length} productos más</p>}
                {cuando && <p className="pz-oferta-cuando">{cuando[0].toUpperCase() + cuando.slice(1)}</p>}
              </div>
            </article>
          );
        })}
      </div>
      {n > 1 && (
        <div className="pz-puntos" aria-hidden="true">
          {ofertas.map((o, k) => <span key={o.id} className={k === actual ? "on" : ""} />)}
        </div>
      )}
    </section>
  );
}

export function Pantalla({ apariencia: a, moneda, negocio, sucursal, estado, vistaPrevia, ofertas, children }: Props) {
  const raiz = useRef<HTMLDivElement>(null);
  const etiqueta = useRef<HTMLParagraphElement>(null);
  const panel = a.estilo === "panel";
  const nombre = a.mostrar_nombre ? negocio : "";
  const suc = a.mostrar_sucursal ? (sucursal ?? "") : "";
  const logo = a.mostrar_logo ? a.logo : null;
  const qr = a.mostrar_qr ? a.qr : null;
  const centro = a.posicion_logo === "centro" && !panel;
  const clases = ["pz", `estilo-${a.estilo}`, centro ? "logo-centro" : "logo-esquina", logo ? "" : "sin-logo"].join(" ");

  // El precio siempre cabe a lo ancho, tenga las cifras que tenga.
  useLayoutEffect(() => {
    const et = etiqueta.current, r = raiz.current;
    if (!et || !r) return;
    const ajustar = () => {
      et.style.setProperty("--pz-escala", "1");
      const cont = et.parentElement as HTMLElement;
      const estilo = getComputedStyle(cont);
      const disponible = cont.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
      const ancho = et.getBoundingClientRect().width;
      if (ancho > disponible && disponible > 0) et.style.setProperty("--pz-escala", String(Math.max(0.35, (disponible / ancho) * 0.97)));
    };
    ajustar();
    const obs = new ResizeObserver(ajustar);
    obs.observe(r);
    return () => obs.disconnect();
  }, [estado, a.estilo]);

  const nombreConSucursal = (
    <>
      {nombre || suc}
      {nombre && suc && <span className="pz-sucursal">{suc}</span>}
    </>
  );
  const hayNombre = Boolean(nombre || suc);

  let cuerpo: React.ReactNode;
  if (estado.tipo === "producto") {
    const [entero, centavos] = formato.format(estado.precio).split(".");
    cuerpo = (
      <main className={`pz-resultado${estado.oferta?.precio_oferta != null ? " en-oferta" : ""}`}
        aria-label={`${estado.nombre}, ${moneda} ${entero}.${centavos}${estado.oferta ? `, ${estado.oferta.texto}` : ""}`}>
        <div className={`pz-cuenta${vistaPrevia ? " quieta" : ""}`}>
          <span key={estado.vez} style={{ ["--pz-duracion" as string]: `${a.segundos}s` }} />
        </div>
        {!panel && (logo || hayNombre) && (
          <header className="pz-rcabecera">
            {logo && <img src={logo} alt="" />}
            {hayNombre && <span>{[nombre, suc].filter(Boolean).join(" · ")}</span>}
          </header>
        )}
        <div className="pz-producto">
          <p className="pz-nombre">{estado.nombre}</p>
          <p className="pz-codigo">Código <span>{estado.codigo}</span></p>
          {estado.oferta && (
            <p className="pz-en-oferta">
              <span className="pz-oferta-sello">{estado.oferta.texto}</span>
              {estado.oferta.antes !== undefined && estado.oferta.antes > estado.precio && (
                <span className="pz-antes">Antes <s>{moneda} {formato.format(estado.oferta.antes)}</s> · Ahorras {moneda} {formato.format(estado.oferta.antes - estado.precio)}</span>
              )}
            </p>
          )}
        </div>
        <p className="pz-etiqueta" ref={etiqueta}>
          <span className="pz-moneda">{moneda}</span>
          <span className="pz-entero">{entero}</span>
          <span className="pz-centavos">{centavos}</span>
        </p>
      </main>
    );
  } else {
    const no = estado.tipo === "no" || estado.tipo === "sin_fuente" || estado.tipo === "suspendido";
    const conOfertas = a.mostrar_ofertas && !!ofertas?.length && (estado.tipo === "espera" || estado.tipo === "buscando");
    cuerpo = (
      <main className={`pz-espera${conOfertas ? " con-ofertas" : ""}`}>
        {!panel && (logo || hayNombre) && (
          <header className="pz-cabecera">
            {logo && <img className="pz-cabecera-logo" src={logo} alt={negocio} />}
            {hayNombre && <span className="pz-cabecera-nombre">{nombreConSucursal}</span>}
          </header>
        )}
        <section className="pz-centro">
          <h1 className={`pz-titulo${no ? " no" : ""}`}>
            {estado.tipo === "suspendido" ? "Servicio no disponible"
              : estado.tipo === "no" ? "No encontramos este producto"
              : estado.tipo === "sin_fuente" ? "Esta sucursal todavía no tiene precios"
              : a.titulo_espera}
          </h1>
          <div className={`pz-laser${no ? " no" : ""}${estado.tipo === "buscando" ? " buscando" : ""}`} aria-hidden="true"><span /></div>
          <p className="pz-pista">
            {estado.tipo === "suspendido" ? "Consulta los precios en caja."
              : estado.tipo === "no" ? <>Código <strong>{estado.codigo}</strong>. Consulta el precio en caja.</>
              : estado.tipo === "sin_fuente" ? "Elige su inventario en el panel de Prezcio."
              : a.mensaje_espera}
          </p>
        </section>
        {conOfertas && <Carrusel ofertas={ofertas!} titulo={a.titulo_ofertas} segundos={a.segundos_oferta} moneda={moneda} />}
        {!panel && qr && (
          <aside className="pz-qr"><span>{a.texto_qr}</span><img src={qr} alt="Código QR" /></aside>
        )}
      </main>
    );
  }

  return (
    <div ref={raiz} className={clases} style={variables(a) as React.CSSProperties}>
      {panel && (
        <aside className="pz-panel">
          <div className="pz-panel-marca">
            {logo && <img src={logo} alt={negocio} />}
            {hayNombre && <p className="pz-panel-nombre">{nombreConSucursal}</p>}
          </div>
          {qr && <figure className="pz-panel-qr"><img src={qr} alt="Código QR" /><figcaption>{a.texto_qr}</figcaption></figure>}
        </aside>
      )}
      {cuerpo}
      {a.estilo === "etiqueta" && <div className="pz-riel" />}
      {children}
    </div>
  );
}
