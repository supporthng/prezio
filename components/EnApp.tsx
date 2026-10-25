"use client";

import { useEffect, useState } from "react";

type ApiApp = { ir_app?: (s: string) => Promise<unknown>; salir?: () => Promise<unknown> };
const apiApp = (): ApiApp | null => (typeof window !== "undefined" ? (window as { pywebview?: { api?: ApiApp } }).pywebview?.api ?? null : null);

/** ¿Esta página está abierta dentro de la app Prezio Administrador? (la app pone window.pywebview.api) */
export function useEnApp(): boolean {
  const [en, setEn] = useState(false);
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => {
      if (apiApp()?.ir_app) { setEn(true); clearInterval(t); }
      else if (++n > 30) clearInterval(t);
    }, 150);
    return () => clearInterval(t);
  }, []);
  return en;
}

/** En la app: volver a «Base de datos» o «Copia automática» sin salir de la ventana. */
export function EnlacesApp() {
  const en = useEnApp();
  if (!en) return null;
  return (
    <>
      <button type="button" className="subnav-app" onClick={() => void apiApp()?.ir_app?.("base")}>Base de datos</button>
      <button type="button" className="subnav-app" onClick={() => void apiApp()?.ir_app?.("copia")}>Copia automática</button>
    </>
  );
}

/** Lo que no va dentro de la app (cada app es de un solo negocio). */
export function SoloWeb({ children }: { children: React.ReactNode }) {
  return useEnApp() ? null : <>{children}</>;
}

/** «Salir»: en la web cierra la sesión; en la app también la de la app (y vuelve a su pantalla de entrar). */
export function BotonSalir() {
  const en = useEnApp();
  return (
    <form action="/salir" method="post" onSubmit={(e) => { if (en) { e.preventDefault(); void apiApp()?.salir?.(); } }}>
      <button className="boton secundario" type="submit">Salir</button>
    </form>
  );
}
