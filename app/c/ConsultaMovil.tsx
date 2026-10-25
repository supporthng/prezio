"use client";

import { useEffect, useRef, useState } from "react";
import { llamar, ErrorEquipo } from "@/lib/equipo";
import { variantes } from "@/lib/codigos";
import { legible } from "@/lib/apariencia";
import { abrirLector, activarSonido, type Lector } from "@/lib/lectorCamara";

type Sucursal = { id: string; codigo: string; nombre: string; ubicacion: boolean; radio_m: number };
type Props = { negocio: string; moneda: string; sucursal: Sucursal; color: string; logo: string | null };
type Respuesta = { encontrado?: boolean; codigo?: string; nombre?: string; precio?: number | string; error?: string; distancia_m?: number; radio_m?: number };
type Vista =
  | { tipo: "inicio" }
  | { tipo: "camara" }
  | { tipo: "buscando"; codigo: string }
  | { tipo: "producto"; codigo: string; nombre: string; precio: number }
  | { tipo: "no"; codigo: string }
  | { tipo: "error"; titulo: string; texto: string; reintentar?: boolean };

const formato = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const distancia = (m: number) => (m >= 1000 ? `${(m / 1000).toLocaleString("es-DO", { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`);

/** Consulta desde el celular: escanear con la cámara o escribir el código; con ubicación si la sucursal la exige. */
export function ConsultaMovil({ negocio, moneda, sucursal, color, logo }: Props) {
  const [vista, setVista] = useState<Vista>({ tipo: "inicio" });
  const [guia, setGuia] = useState("");
  const [escrito, setEscrito] = useState("");
  const [sinCamara, setSinCamara] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const lector = useRef<Lector | null>(null);
  const posicion = useRef<{ lat: number; lon: number; t: number } | null>(null);
  const precioColor = legible(color, "#ffffff", 4.5);

  // La cámara se abre sola al entrar (el navegador pide permiso la primera vez).
  const abierta = useRef(false);
  useEffect(() => {
    if (!abierta.current) { abierta.current = true; void escanear(); }
    return () => { lector.current?.detener(); lector.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function consultar(leido: string) {
    const codigo = leido.trim();
    if (!codigo || codigo.length > 64) return;
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
      if (r.error === "lejos") {
        setVista({ tipo: "error", titulo: "Estás lejos de la tienda", reintentar: true,
          texto: `Esta consulta funciona dentro de ${sucursal.nombre} (hasta ${distancia(r.radio_m ?? sucursal.radio_m)}). Estás a ${distancia(r.distancia_m ?? 0)}.` });
      } else if (r.error === "ubicacion") {
        setVista({ tipo: "error", titulo: "Necesitamos tu ubicación", texto: "Activa la ubicación y vuelve a intentar.", reintentar: true });
      } else if (r.error) {
        setVista({ tipo: "error", titulo: "No disponible", texto: r.error === "limite" ? "Hay muchas consultas en este momento. Intenta en un minuto." : "La consulta desde el celular no está disponible ahora." });
      } else if (r.encontrado) {
        setVista({ tipo: "producto", codigo: r.codigo ?? codigo, nombre: r.nombre ?? "", precio: Number(r.precio) || 0 });
      } else setVista({ tipo: "no", codigo });
    } catch (e) {
      setVista({ tipo: "error", titulo: "Sin conexión", reintentar: true,
        texto: e instanceof ErrorEquipo && e.tipo === "red" ? "Revisa el internet del celular y vuelve a intentar." : "No se pudo consultar. Vuelve a intentar." });
    }
  }

  async function escanear() {
    activarSonido();
    setGuia("Abriendo la cámara…");
    setVista({ tipo: "camara" });
    for (let i = 0; i < 30 && !caja.current; i++) await new Promise((r) => requestAnimationFrame(() => r(null)));
    if (!caja.current) return;
    lector.current?.detener();
    try {
      lector.current = await abrirLector(caja.current, (codigo) => { lector.current = null; void consultar(codigo); }, setGuia);
    } catch {
      lector.current = null;   // sin permiso o sin cámara: queda la opción de escribir el código
      setSinCamara(true);
      setVista({ tipo: "inicio" });
    }
  }
  function cancelar() { lector.current?.detener(); lector.current = null; setVista({ tipo: "inicio" }); }

  const v = vista;
  return (
    <main className="movil" style={{ ["--movil-color" as string]: color, ["--movil-precio" as string]: precioColor }}>
      <header className="movil-cabeza">
        {logo && <img src={logo} alt="" className="movil-logo" />}
        <div><p className="movil-negocio">{negocio}</p><p className="movil-sucursal">{sucursal.nombre}</p></div>
      </header>

      {v.tipo === "camara" ? (
        <section className="movil-tarjeta">
          <div ref={caja} className="movil-lector" onClick={() => activarSonido()}><div className="laser" /></div>
          <p className="movil-guia" role="status">{guia}</p>
          <button className="movil-boton secundario" type="button" onClick={cancelar}>Escribir el código</button>
        </section>
      ) : v.tipo === "producto" ? (
        <section className="movil-tarjeta movil-resultado" aria-live="polite">
          <p className="movil-nombre">{v.nombre}</p>
          <p className="movil-precio"><span className="moneda">{moneda}</span>{formato.format(v.precio)}</p>
          <p className="movil-codigo">Código {v.codigo}</p>
          <button className="movil-boton" type="button" onClick={escanear}>Escanear otro</button>
        </section>
      ) : v.tipo === "no" ? (
        <section className="movil-tarjeta" aria-live="polite">
          <h1>No encontramos este producto</h1>
          <p className="movil-codigo">Código {v.codigo}</p>
          <p>Pregunta el precio en caja.</p>
          <button className="movil-boton" type="button" onClick={escanear}>Escanear otro</button>
        </section>
      ) : v.tipo === "error" ? (
        <section className="movil-tarjeta" role="alert">
          <h1>{v.titulo}</h1>
          <p>{v.texto}</p>
          <button className="movil-boton" type="button" onClick={() => setVista({ tipo: "inicio" })}>{v.reintentar ? "Volver a intentar" : "Volver"}</button>
        </section>
      ) : (
        <section className="movil-tarjeta">
          <h1>Consulta un precio</h1>
          {sinCamara
            ? <p className="movil-alerta" role="alert">No pudimos abrir la cámara. Permite la cámara para esta página (candado junto a la dirección › Cámara › Permitir) o escribe el código.</p>
            : <p className="movil-ayuda">Apunta la cámara al código de barras del producto.</p>}
          <button className="movil-boton grande" type="button" onClick={escanear} disabled={v.tipo === "buscando"}>
            {v.tipo === "buscando" ? "Buscando…" : "📷 Escanear con la cámara"}
          </button>
          <form className="movil-escribir" onSubmit={(e) => { e.preventDefault(); void consultar(escrito); }}>
            <label htmlFor="codigo-escrito">o escribe el código</label>
            <div className="movil-fila">
              <input id="codigo-escrito" inputMode="numeric" autoComplete="off" value={escrito} maxLength={64}
                onChange={(e) => setEscrito(e.target.value)} placeholder="7501055363063" />
              <button className="movil-boton secundario" type="submit" disabled={!escrito.trim() || v.tipo === "buscando"}>Ver precio</button>
            </div>
          </form>
          {sucursal.ubicacion && <p className="movil-nota">Funciona dentro de la tienda: te pediremos la ubicación.</p>}
        </section>
      )}
      <footer className="movil-pie">Precios de {negocio} · {sucursal.nombre}</footer>
    </main>
  );
}
