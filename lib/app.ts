/** Puente con las apps Prezio (Android y Windows) cuando la página /equipo corre dentro de ellas.
 *  Android: objeto window.PrezioApp. Windows (pywebview): window.pywebview.api (asíncrono). */

export type AppNativa = {
  plataforma: "android" | "windows";
  version: () => Promise<string>;
  salir: () => void;
  cerrar: () => void;
  buscarActualizacion: () => void;
  /** La clave del equipo guardada por la app ("" si no hay; undefined si la app es vieja y no sabe guardarla). */
  claveGuardada: () => Promise<string | undefined>;
  guardarClave: (clave: string) => Promise<void>;
};
const CLAVE_VALIDA = /^[0-9a-f]{64}$/;

type Android = { plataforma(): string; version(): string; salir(): void; cerrar?(): void; buscarActualizacion(): void;
  claveGuardada?(): string; guardarClave?(c: string): void };
type Windows = { version(): Promise<string>; salir(): Promise<unknown>; cerrar?(): Promise<unknown>; buscarActualizacion(): Promise<unknown>;
  claveGuardada?(): Promise<string>; guardarClave?(c: string): Promise<unknown> };

const limpia = (c: unknown) => (typeof c === "string" && CLAVE_VALIDA.test(c) ? c : "");

export function appNativa(): AppNativa | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { PrezioApp?: Android; pywebview?: { api?: Windows } };
  if (w.PrezioApp) {
    const a = w.PrezioApp;
    return {
      plataforma: "android",
      version: async () => { try { return a.version(); } catch { return ""; } },
      salir: () => a.salir(),
      cerrar: () => { if (a.cerrar) a.cerrar(); else a.salir(); },
      buscarActualizacion: () => a.buscarActualizacion(),
      claveGuardada: async () => { if (!a.claveGuardada) return undefined; try { return limpia(a.claveGuardada()); } catch { return undefined; } },
      guardarClave: async (c) => { try { a.guardarClave?.(c); } catch { /* app vieja */ } },
    };
  }
  const api = w.pywebview?.api;
  if (api && typeof api.salir === "function") {
    return {
      plataforma: "windows",
      version: async () => { try { return String(await api.version()); } catch { return ""; } },
      salir: () => { void api.salir(); },
      cerrar: () => { void (api.cerrar ?? api.salir)(); },
      buscarActualizacion: () => { void api.buscarActualizacion(); },
      claveGuardada: async () => { if (typeof api.claveGuardada !== "function") return undefined; try { return limpia(await api.claveGuardada()); } catch { return undefined; } },
      guardarClave: async (c) => { try { await api.guardarClave?.(c); } catch { /* app vieja */ } },
    };
  }
  return null;
}

/** Avisos de la app al actualizarse: buscando, al_dia, descargando, instalando, error. */
export const TEXTO_ACTUALIZACION: Record<string, string> = {
  buscando: "Buscando una versión nueva de la app…",
  al_dia: "La app ya está en la última versión.",
  descargando: "Descargando la versión nueva de la app…",
  instalando: "Instalando la versión nueva: la app se abre sola en unos segundos.",
  confirmar: "Android pide confirmar la instalación.",
  error: "No se pudo actualizar la app. Se intentará de nuevo más tarde.",
};
