"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { llamar, ErrorEquipo } from "@/lib/equipo";
import { variantes } from "@/lib/codigos";
import { legible, mezclar, sobre } from "@/lib/apariencia";
import { abrirLector, activarSonido, type Lector } from "@/lib/lectorCamara";

type Sucursal = { id: string; codigo: string; nombre: string; ubicacion: boolean; radio_m: number };
type Props = { negocio: string; moneda: string; sucursal: Sucursal; color: string; logo: string | null; clase?: string };
type Respuesta = { encontrado?: boolean; codigo?: string; nombre?: string; precio?: number | string; error?: string; distancia_m?: number; radio_m?: number };
type Vista =
  | { tipo: "inicio" }
  | { tipo: "camara" }
  | { tipo: "buscando"; codigo: string }
  | { tipo: "producto"; codigo: string; nombre: string; precio: number; vez: number }
  | { tipo: "no"; codigo: string; vez: number }
  | { tipo: "error"; titulo: string; texto: string; reintentar?: boolean };

/** Segundos que se ve el resultado antes de volver solo a la cámara. */
const VUELTA = { producto: 9, no: 5 } as const;

const formato = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const distancia = (m: number) => (m >= 1000 ? `${(m / 1000).toLocaleString("es-DO", { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`);

/** Consulta desde el celular: la cámara se abre sola; el precio sale como etiqueta y vuelve sola a la cámara. */
export function ConsultaMovil({ negocio, moneda, sucursal, color, logo, clase }: Props) {
  const [vista, setVista] = useState<Vista>({ tipo: "inicio" });
  const [guia, setGuia] = useState("");
  const [escrito, setEscrito] = useState("");
  const [sinCamara, setSinCamara] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const lector = useRef<Lector | null>(null);
  const posicion = useRef<{ lat: number; lon: number; t: number } | null>(null);
  const vez = useRef(0);
  const usoCamara = useRef(false);    // volver a la cámara solo si la consulta vino de ella

  const tinta = sobre(color);
  const estilo = {
    ["--m" as string]: color,
    ["--m-sobre" as string]: tinta,
    ["--m-tenue" as string]: mezclar(tinta, color, 0.22),
    ["--m-fondo" as string]: mezclar(color, "#ffffff", 0.9),
    ["--m-hondo" as string]: mezclar(color, "#0f2440", 0.55),
    ["--m-texto" as string]: legible(color, "#ffffff", 4.5),
  };

  // La cámara se abre sola al entrar (el navegador pide permiso la primera vez).
  const abierta = useRef(false);
  useEffect(() => {
    if (!abierta.current) { abierta.current = true; void escanear(); }
    return () => { lector.current?.detener(); lector.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El precio siempre cabe a lo ancho de la etiqueta, tenga las cifras que tenga.
  const precio = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const el = precio.current;
    if (!el) return;
    const ajustar = () => {
      el.style.fontSize = "";
      const max = parseFloat(getComputedStyle(el).fontSize);
      const ancho = el.parentElement!.clientWidth - 48;
      const real = el.scrollWidth;
      if (real > ancho) el.style.fontSize = `${Math.max(32, Math.floor(max * (ancho / real) * 0.98))}px`;
    };
    ajustar();
    void document.fonts?.ready.then(ajustar);
    addEventListener("resize", ajustar);
    return () => removeEventListener("resize", ajustar);
  }, [vista]);

  // Tras mostrar el precio (o «no encontrado»), vuelve sola a escanear.
  const seg = vista.tipo === "producto" ? VUELTA.producto : vista.tipo === "no" ? VUELTA.no : 0;
  const claveVuelta = vista.tipo === "producto" || vista.tipo === "no" ? vista.vez : 0;
  useEffect(() => {
    if (!seg) return;
    const t = setTimeout(() => { if (usoCamara.current && !sinCamara) void escanear(); else { setEscrito(""); setVista({ tipo: "inicio" }); } }, seg * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveVuelta, seg]);

  function ubicacion(): Promise<{ lat: number; lon: number }> {
    const p = posicion.current;
    if (p && Date.now() - p.t < 60000) return Promise.resolve(p);
    return new Promise((ok, mal) => {
      if (!navigator.geolocation) { mal(new Error("sin_gps")); return; }
      navigator.geolocation.getCurrentPosition(
        (x) => { posicion.current = { lat: x.coords.latitude, lon: x.coords.longitude, t: Date.now() }; ok(posicion.current); },
        (e) => mal(new Error(e.code === 1 ? "permiso" : "sin_gps")),
        { enableHighAccuracy: true, maximumAge: 60000, timeout: 15000 },
      );
    });
  }

  async function consultar(leido: string, deCamara: boolean) {
    const codigo = leido.trim();
    if (!codigo || codigo.length > 64) return;
    usoCamara.current = deCamara;
    setVista({ tipo: "buscando", codigo });
    let lat: number | null = null, lon: number | null = null;
    if (sucursal.ubicacion) {
      try { ({ lat, lon } = await ubicacion()); } catch (e) {
        setVista({ tipo: "error", titulo: "Necesitamos tu ubicación",
          texto: (e as Error).message === "permiso"
            ? `Los precios se consultan dentro de ${sucursal.nombre}. Permite la ubicación para esta página (candado junto a la dirección › Ubicación › Permitir) y vuelve a intentar.`
            : "No pudimos saber dónde estás. Activa la ubicación del celular y vuelve a intentar.", reintentar: true });
        return;
      }
    }
    try {
      const r = await llamar<Respuesta>("consulta_movil", { p_sucursal: sucursal.id, p_formas: variantes(codigo).slice(0, 16), p_lat: lat, p_lon: lon });
      vez.current++;
      if (r.error === "lejos") {
        setVista({ tipo: "error", titulo: "Estás lejos de la tienda", reintentar: true,
          texto: `Esta consulta funciona dentro de ${sucursal.nombre} (hasta ${distancia(r.radio_m ?? sucursal.radio_m)}). Estás a ${distancia(r.distancia_m ?? 0)}.` });
      } else if (r.error === "ubicacion") {
        setVista({ tipo: "error", titulo: "Necesitamos tu ubicación", texto: "Activa la ubicación y vuelve a intentar.", reintentar: true });
      } else if (r.error) {
        setVista({ tipo: "error", titulo: "No disponible", texto: r.error === "limite" ? "Hay muchas consultas en este momento. Intenta en un minuto." : "La consulta desde el celular no está disponible ahora." });
      } else if (r.encontrado) {
        setVista({ tipo: "producto", codigo: r.codigo ?? codigo, nombre: r.nombre ?? "", precio: Number(r.precio) || 0, vez: vez.current });
      } else setVista({ tipo: "no", codigo, vez: vez.current });
    } catch (e) {
      setVista({ tipo: "error", titulo: "Sin conexión", reintentar: true,
        texto: e instanceof ErrorEquipo && e.tipo === "red" ? "Revisa el internet del celular y vuelve a intentar." : "No se pudo consultar. Vuelve a intentar." });
    }
  }

  async function escanear() {
    activarSonido();
    setSinCamara(false);
    setGuia("Abriendo la cámara…");
    setVista({ tipo: "camara" });
    for (let i = 0; i < 30 && !caja.current; i++) await new Promise((r) => requestAnimationFrame(() => r(null)));
    if (!caja.current) return;
    lector.current?.detener();
    try {
      lector.current = await abrirLector(caja.current, (codigo) => { lector.current = null; void consultar(codigo, true); }, setGuia);
    } catch {
      lector.current = null;   // sin permiso o sin cámara: queda la opción de escribir el código
      setSinCamara(true);
      setVista({ tipo: "inicio" });
    }
  }
  function aEscribir() { lector.current?.detener(); lector.current = null; setVista({ tipo: "inicio" }); }
  const otra = () => (usoCamara.current && !sinCamara ? void escanear() : (setEscrito(""), setVista({ tipo: "inicio" })));

  const v = vista;
  return (
    <main className={`mv ${clase ?? ""}`} style={estilo as React.CSSProperties}>
      <header className="mv-banda">
        {logo && <span className="mv-logo"><img src={logo} alt="" /></span>}
        <div className="mv-marca">
          <p className="mv-negocio">{negocio}</p>
          <p className="mv-sucursal">{sucursal.nombre}</p>
        </div>
      </header>

      <div className="mv-cuerpo">
        {v.tipo === "camara" ? (
          <section className="mv-escaner">
            <div ref={caja} className="movil-lector mv-visor" onClick={() => activarSonido()}>
              <span className="mv-esquinas" aria-hidden="true"><i /><i /><i /><i /></span>
              <div className="laser" />
            </div>
            <p className="mv-guia" role="status">{guia}</p>
            <button className="mv-boton claro" type="button" onClick={aEscribir}>Escribir el código</button>
          </section>
        ) : v.tipo === "buscando" ? (
          <section className="mv-etiqueta mv-buscando" aria-live="polite">
            <span className="mv-hoyo" aria-hidden="true" />
            <p className="mv-nombre">Buscando…</p>
            <p className="mv-codigo">Código {v.codigo}</p>
            <div className="mv-cargando" aria-hidden="true"><span /></div>
          </section>
        ) : v.tipo === "producto" ? (
          <>
            <section key={v.vez} className="mv-etiqueta mv-entra" aria-live="polite">
              <span className="mv-hoyo" aria-hidden="true" />
              <p className="mv-nombre movil-nombre">{v.nombre}</p>
              <p ref={precio} className="mv-precio movil-precio"><span className="mv-moneda moneda">{moneda}</span>{formato.format(v.precio).split(".")[0]}<span className="mv-centavos">.{formato.format(v.precio).split(".")[1]}</span></p>
              <p className="mv-codigo">Código {v.codigo}</p>
              <div className="mv-cuenta" aria-hidden="true"><span style={{ animationDuration: `${VUELTA.producto}s` }} /></div>
            </section>
            <button className="mv-boton" type="button" onClick={otra}>{usoCamara.current && !sinCamara ? "Escanear otro ahora" : "Consultar otro"}</button>
            <p className="mv-pie-nota">{usoCamara.current && !sinCamara ? "La cámara vuelve sola en unos segundos." : "Se borra solo en unos segundos."}</p>
          </>
        ) : v.tipo === "no" ? (
          <>
            <section key={v.vez} className="mv-etiqueta mv-no mv-entra" aria-live="polite">
              <span className="mv-hoyo" aria-hidden="true" />
              <h1>No encontramos este producto</h1>
              <p className="mv-codigo">Código {v.codigo}</p>
              <p className="mv-texto">Pregunta el precio en caja.</p>
              <div className="mv-cuenta" aria-hidden="true"><span style={{ animationDuration: `${VUELTA.no}s` }} /></div>
            </section>
            <button className="mv-boton" type="button" onClick={otra}>{usoCamara.current && !sinCamara ? "Escanear otro ahora" : "Consultar otro"}</button>
          </>
        ) : v.tipo === "error" ? (
          <section className="mv-tarjeta" role="alert">
            <h1>{v.titulo}</h1>
            <p className="mv-texto">{v.texto}</p>
            <button className="mv-boton" type="button" onClick={() => setVista({ tipo: "inicio" })}>{v.reintentar ? "Volver a intentar" : "Volver"}</button>
          </section>
        ) : (
          <section className="mv-tarjeta">
            <h1>Consulta un precio</h1>
            {sinCamara
              ? <p className="movil-alerta" role="alert">No pudimos abrir la cámara. Permite la cámara para esta página (candado junto a la dirección › Cámara › Permitir) o escribe el código.</p>
              : <p className="mv-texto">Apunta la cámara al código de barras del producto.</p>}
            <button className="mv-boton grande" type="button" onClick={escanear}>Escanear con la cámara</button>
            <form className="mv-escribir" onSubmit={(e) => { e.preventDefault(); void consultar(escrito, false); }}>
              <label htmlFor="codigo-escrito">o escribe el código</label>
              <div className="mv-fila">
                <input id="codigo-escrito" inputMode="numeric" autoComplete="off" value={escrito} maxLength={64}
                  onChange={(e) => setEscrito(e.target.value)} placeholder="7501055363063" />
                <button className="mv-boton claro" type="submit" disabled={!escrito.trim()}>Ver precio</button>
              </div>
            </form>
            {sucursal.ubicacion && <p className="mv-pie-nota">Funciona dentro de la tienda: te pediremos la ubicación.</p>}
          </section>
        )}
      </div>
      <footer className="mv-pie">Precios de {negocio} en {sucursal.nombre}</footer>
    </main>
  );
}
