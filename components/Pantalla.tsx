"use client";

import { useLayoutEffect, useRef } from "react";
import { variables, type Apariencia } from "@/lib/apariencia";

export type EstadoPantalla =
  | { tipo: "espera" }
  | { tipo: "suspendido" }
  | { tipo: "buscando"; codigo: string }
  | { tipo: "no"; codigo: string }
  | { tipo: "sin_fuente"; codigo: string }
  | { tipo: "producto"; codigo: string; nombre: string; precio: number; vez: number };

type Props = {
  apariencia: Apariencia;
  moneda: string;
  negocio: string;
  sucursal?: string | null;
  estado: EstadoPantalla;
  vistaPrevia?: boolean;
  children?: React.ReactNode;
};

const formato = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** La pantalla que ve el cliente: espera con láser, precio grande como en la etiqueta, o «no encontrado». */
export function Pantalla({ apariencia: a, moneda, negocio, sucursal, estado, vistaPrevia, children }: Props) {
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
      <main className="pz-resultado" aria-label={`${estado.nombre}, ${moneda} ${entero}.${centavos}`}>
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
    cuerpo = (
      <main className="pz-espera">
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
              : estado.tipo === "sin_fuente" ? "Elige su inventario en el panel de Prezio."
              : a.mensaje_espera}
          </p>
        </section>
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
