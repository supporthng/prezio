"use client";

import { useEffect, useState } from "react";

type Evento = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type Tipo = "ios" | "android" | null;

type Props = { titulo: string; nombre: string; clave: string };

/**
 * Aviso para agregar el panel (de la Plataforma o de un negocio) a la pantalla de inicio del celular.
 * No aparece en computadoras, dentro de la app ya instalada, ni después de cerrarlo.
 */
export function InstalarApp({ titulo, nombre, clave }: Props) {
  const [tipo, setTipo] = useState<Tipo>(null);
  const [evento, setEvento] = useState<Evento | null>(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(clave) === "no") return;
      const instalada = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (instalada) return;
      const ua = navigator.userAgent;
      const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
      if (ios) setTipo("ios");
      else if (/Android/i.test(ua)) setTipo("android");
    } catch { /* sin almacenamiento */ }
    const antes = (e: Event) => { e.preventDefault(); setEvento(e as Evento); };
    window.addEventListener("beforeinstallprompt", antes);
    return () => window.removeEventListener("beforeinstallprompt", antes);
  }, []);

  if (!tipo) return null;
  const cerrar = () => { setTipo(null); try { localStorage.setItem(clave, "no"); } catch { /* sin almacenamiento */ } };
  const instalar = async () => {
    if (!evento) { setAbierto(true); return; }
    await evento.prompt();
    const r = await evento.userChoice;
    if (r.outcome === "accepted") cerrar();
  };

  return (
    <section className="pl-instalar" aria-labelledby="pl-instalar-t">
      <div className="pl-instalar-cabeza">
        <span className="pl-instalar-icono" aria-hidden="true">📲</span>
        <div>
          <h2 id="pl-instalar-t">{titulo}</h2>
          <p>Agrégala a la pantalla de inicio y ábrela como una app.</p>
        </div>
        <button type="button" className="pl-instalar-x" onClick={cerrar} aria-label="Cerrar este aviso">✕</button>
      </div>
      {tipo === "android" && !abierto && (
        <button type="button" className="boton" onClick={instalar}>{evento ? "Instalar app" : "Ver cómo instalarla"}</button>
      )}
      {(tipo === "ios" || abierto) && (
        <ol className="pl-instalar-pasos">
          {tipo === "ios" ? (
            <>
              <li>Abre esta página en <b>Safari</b>.</li>
              <li>Toca el botón <b>⋯</b> abajo a la derecha y luego <b>Compartir</b>. Si tu Safari muestra el ícono de Compartir <span aria-hidden="true">(cuadro con flecha ↑)</span>, tócalo directo.</li>
              <li>Baja y toca <b>Agregar a inicio</b>.</li>
              <li>Toca <b>Agregar</b>. Aparece el ícono <b>{nombre}</b> en tu pantalla.</li>
            </>
          ) : (
            <>
              <li>Abre esta página en <b>Chrome</b>.</li>
              <li>Toca el menú <b>⋮</b> arriba a la derecha.</li>
              <li>Toca <b>Instalar app</b> o <b>Agregar a pantalla principal</b>.</li>
              <li>Confirma. Aparece el ícono <b>{nombre}</b> en tu pantalla.</li>
            </>
          )}
        </ol>
      )}
      <p className="pl-instalar-nota">Al abrirla entras con tu cuenta, igual que aquí.</p>
    </section>
  );
}
