"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { llamar, ErrorEquipo } from "@/lib/equipo";
import { variantes } from "@/lib/codigos";
import { legible, mezclar, sobre } from "@/lib/apariencia";
import { abrirLector, activarSonido, alActivarSonido, sonidoListo, type Lector } from "@/lib/lectorCamara";

type Sucursal = { id: string; codigo: string; nombre: string; ubicacion: boolean; radio_m: number };
type Props = { negocio: string; moneda: string; sucursal: Sucursal; color: string; logo: string | null; clase?: string };
type Respuesta = { encontrado?: boolean; codigo?: string; nombre?: string; precio?: number | string; error?: string; distancia_m?: number; radio_m?: number;
  oferta?: { texto: string; precio_oferta: number | string | null } | null };
type Vista =
  | { tipo: "inicio" }
  | { tipo: "camara" }
  | { tipo: "buscando"; codigo: string }
  | { tipo: "producto"; codigo: string; nombre: string; precio: number; vez: number; oferta?: { texto: string; antes?: number } }
  | { tipo: "no"; codigo: string; vez: number }
  | { tipo: "error"; titulo: string; texto: string; reintentar?: boolean }
  | { tipo: "comprobando" }
  | { tipo: "fuera"; motivo: "lejos" | "permiso" | "sin_gps"; distancia?: number; radio: number };

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
  // Si la sucursal exige estar dentro, primero se comprueba la ubicación: lejos de la tienda no se puede leer nada.
  useEffect(() => {
    if (!abierta.current) { abierta.current = true; void empezar(); }
    return () => { lector.current?.detener(); lector.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Safari solo deja sonar el pitido después de un toque: cualquier toque en la página lo activa.
  const [conSonido, setConSonido] = useState(true);
  useEffect(() => {
    const quitar = alActivarSonido(() => setConSonido(true));
    const tocar = () => activarSonido();
    document.addEventListener("pointerdown", tocar, true);
    document.addEventListener("touchend", tocar, true);
    return () => { quitar(); document.removeEventListener("pointerdown", tocar, true); document.removeEventListener("touchend", tocar, true); };
  }, []);

  // El precio sube rápido desde cero hasta el valor real (sin movimiento si el teléfono pide menos animación).
  const entero = useRef<HTMLSpanElement>(null);
  const precioFinal = vista.tipo === "producto" ? vista.precio : null;
  const clavePrecio = vista.tipo === "producto" ? vista.vez : 0;
  useEffect(() => {
    const el = entero.current;
    if (!el || precioFinal === null) return;
    const final = formato.format(precioFinal).split(".")[0];
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = final; return; }
    const total = Math.floor(precioFinal), inicio = performance.now(), dur = 750;
    const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
    let id = 0;
    const paso = (t: number) => {
      const x = Math.min(1, (t - inicio - 350) / dur);       // espera a que la etiqueta llegue
      if (x < 0) { el.textContent = "0"; id = requestAnimationFrame(paso); return; }
      const e = 1 - Math.pow(1 - x, 4);
      el.textContent = x >= 1 ? final : fmt.format(Math.floor(total * e));
      if (x < 1) id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => { cancelAnimationFrame(id); el.textContent = final; };
  }, [clavePrecio, precioFinal]);

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

  async function empezar() {
    if (!sucursal.ubicacion) { void escanear(); return; }
    lector.current?.detener(); lector.current = null;
    setVista({ tipo: "comprobando" });
    let lat: number, lon: number;
    try { ({ lat, lon } = await ubicacion()); } catch (e) {
      const m = (e as Error).message;
      setVista({ tipo: "fuera", motivo: m === "permiso" ? "permiso" : "sin_gps", radio: sucursal.radio_m });
      return;
    }
    try {
      const r = await llamar<{ ok?: boolean; error?: string; distancia_m?: number; radio_m?: number }>("consulta_movil_lugar", { p_sucursal: sucursal.id, p_lat: lat, p_lon: lon });
      if (r.error === "lejos") { setVista({ tipo: "fuera", motivo: "lejos", distancia: r.distancia_m, radio: r.radio_m ?? sucursal.radio_m }); return; }
      if (r.error === "ubicacion") { setVista({ tipo: "fuera", motivo: "sin_gps", radio: sucursal.radio_m }); return; }
      if (r.error) { setVista({ tipo: "error", titulo: "No disponible", texto: "La consulta desde el celular no está disponible ahora." }); return; }
    } catch {
      setVista({ tipo: "error", titulo: "Sin conexión", reintentar: true, texto: "Revisa el internet del celular y vuelve a intentar." });
      return;
    }
    void escanear();
  }
  const comprobarOtraVez = () => { posicion.current = null; void empezar(); };

  async function consultar(leido: string, deCamara: boolean) {
    const codigo = leido.trim();
    if (!codigo || codigo.length > 64) return;
    usoCamara.current = deCamara;
    setVista({ tipo: "buscando", codigo });
    let lat: number | null = null, lon: number | null = null;
    if (sucursal.ubicacion) {
      try { ({ lat, lon } = await ubicacion()); } catch (e) {
        setVista({ tipo: "fuera", motivo: (e as Error).message === "permiso" ? "permiso" : "sin_gps", radio: sucursal.radio_m });
        return;
      }
    }
    try {
      const r = await llamar<Respuesta>("consulta_movil", { p_sucursal: sucursal.id, p_formas: variantes(codigo).slice(0, 16), p_lat: lat, p_lon: lon });
      vez.current++;
      if (r.error === "lejos") {
        setVista({ tipo: "fuera", motivo: "lejos", distancia: r.distancia_m, radio: r.radio_m ?? sucursal.radio_m });
      } else if (r.error === "ubicacion") {
        setVista({ tipo: "fuera", motivo: "sin_gps", radio: sucursal.radio_m });
      } else if (r.error) {
        setVista({ tipo: "error", titulo: "No disponible", texto: r.error === "limite" ? "Hay muchas consultas en este momento. Intenta en un minuto." : "La consulta desde el celular no está disponible ahora." });
      } else if (r.encontrado) {
        const normal = Number(r.precio) || 0;
        const po = r.oferta && r.oferta.precio_oferta !== null ? Number(r.oferta.precio_oferta) : null;
        setVista({ tipo: "producto", codigo: r.codigo ?? codigo, nombre: r.nombre ?? "", precio: po ?? normal, vez: vez.current,
          oferta: r.oferta ? { texto: r.oferta.texto, antes: po !== null && po < normal ? normal : undefined } : undefined });
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
      // Normalmente el pitido queda activo solo al encender la cámara; si el teléfono no lo permite, se pide un toque.
      setTimeout(() => { if (!sonidoListo()) setConSonido(false); }, 1500);
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
              {!conSonido && (
                <button type="button" className="mv-sonido" onClick={(e) => { e.stopPropagation(); activarSonido(); }}>🔇 Toca para activar el pitido</button>
              )}
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
            <div key={v.vez} className="mv-colgar">
            <span className="mv-hilo" aria-hidden="true" />
            <section className={`mv-etiqueta mv-gira${v.oferta ? " con-oferta" : ""}`} aria-live="polite">
              <span className="mv-hoyo" aria-hidden="true" />
              <span className="mv-brillo" aria-hidden="true" />
              {v.oferta && <span className="mv-sello" aria-hidden="true">Oferta</span>}
              <p className="mv-nombre movil-nombre">{v.nombre}</p>
              <p ref={precio} className="mv-precio movil-precio"><span className="mv-moneda moneda">{moneda}</span><span ref={entero}>{formato.format(v.precio).split(".")[0]}</span><span className="mv-centavos">.{formato.format(v.precio).split(".")[1]}</span></p>
              {v.oferta && (
                <p className="mv-oferta"><span>{v.oferta.texto}</span>
                  {v.oferta.antes !== undefined && <> Antes <s>{moneda} {formato.format(v.oferta.antes)}</s></>}</p>
              )}
              <p className="mv-codigo">Código {v.codigo}</p>
              <div className="mv-cuenta" aria-hidden="true"><span style={{ animationDuration: `${VUELTA.producto}s` }} /></div>
            </section>
            </div>
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
        ) : v.tipo === "comprobando" ? (
          <section className="mv-tarjeta mv-comprobando" aria-live="polite">
            <span className="mv-pin" aria-hidden="true">📍</span>
            <h1>Comprobando que estás en la tienda…</h1>
            <p className="mv-texto">Los precios de {sucursal.nombre} solo se consultan dentro de la tienda. Si el celular lo pide, permite la ubicación.</p>
            <div className="mv-cargando oscuro" aria-hidden="true"><span /></div>
          </section>
        ) : v.tipo === "fuera" ? (
          <section className="mv-fuera" role="alert">
            <span className="mv-fuera-icono" aria-hidden="true">{v.motivo === "lejos" ? "🚫" : "📍"}</span>
            {v.motivo === "lejos" ? (
              <>
                <h1>No estás en la tienda</h1>
                {v.distancia !== undefined && <p className="mv-fuera-dato">Estás a <strong>{distancia(v.distancia)}</strong></p>}
                <p className="mv-fuera-texto">Los precios de {negocio} solo se pueden consultar dentro de <strong>{sucursal.nombre}</strong> (a menos de {distancia(v.radio)}).</p>
              </>
            ) : v.motivo === "permiso" ? (
              <>
                <h1>Activa tu ubicación</h1>
                <p className="mv-fuera-texto">Para consultar precios tienes que estar dentro de <strong>{sucursal.nombre}</strong>, y para saberlo necesitamos tu ubicación.</p>
                <ol className="mv-fuera-pasos">
                  <li>Toca <strong>aA</strong> o el candado junto a la dirección.</li>
                  <li>Entra en <strong>Ubicación</strong> y elige <strong>Permitir</strong>.</li>
                  <li>Vuelve aquí y toca el botón.</li>
                </ol>
              </>
            ) : (
              <>
                <h1>No sabemos dónde estás</h1>
                <p className="mv-fuera-texto">Activa la ubicación del celular (Ajustes › Privacidad › Localización) para consultar precios dentro de <strong>{sucursal.nombre}</strong>.</p>
              </>
            )}
            <button className="mv-boton fuera" type="button" onClick={comprobarOtraVez}>
              {v.motivo === "lejos" ? "Ya estoy en la tienda" : "Comprobar otra vez"}
            </button>
          </section>
        ) : v.tipo === "error" ? (
          <section className="mv-tarjeta" role="alert">
            <h1>{v.titulo}</h1>
            <p className="mv-texto">{v.texto}</p>
            <button className="mv-boton" type="button" onClick={() => (v.reintentar ? comprobarOtraVez() : setVista({ tipo: "inicio" }))}>{v.reintentar ? "Volver a intentar" : "Volver"}</button>
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
