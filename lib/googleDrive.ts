/** Elegir un Excel, CSV u hoja de Google directamente desde Google Drive (selector oficial de Google).
 *
 *  Solo se pide el permiso «drive.file»: Prezcio ve ÚNICAMENTE el archivo que la persona elige, nunca el resto
 *  de su Drive. El permiso dura una hora y no se guarda en ningún lado.
 *
 *  Variables en Vercel (las tres son públicas, van con el prefijo NEXT_PUBLIC_):
 *    NEXT_PUBLIC_GOOGLE_CLIENT_ID   ID de cliente OAuth «Aplicación web» (Google Cloud › Credenciales)
 *    NEXT_PUBLIC_GOOGLE_API_KEY     Clave de API para el selector (Google Cloud › Credenciales)
 *    NEXT_PUBLIC_GOOGLE_APP_ID      Número del proyecto de Google Cloud (Panel › Número del proyecto)
 *  Sin ellas el botón de Drive no aparece y todo sigue funcionando con el enlace pegado. */

/* eslint-disable @typescript-eslint/no-explicit-any */

// .trim(): un espacio o salto de línea pegado de más en Vercel hace que Google rechace la clave.
const CLIENT_ID = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "").trim();
const API_KEY = (process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? "").trim();
const APP_ID = (process.env.NEXT_PUBLIC_GOOGLE_APP_ID ?? "").trim();

/** Revisa que los tres valores tengan la forma correcta, para decir cuál está mal antes de que Google responda
 *  con un error genérico («la clave de desarrollador no es válida»). Devuelve el aviso, o "" si todo se ve bien. */
export function revisarConfiguracionDrive(): string {
  const forma = (v: string) => `Empieza con «${v.slice(0, 4)}…», termina en «…${v.slice(-3)}» y mide ${v.length} caracteres.`;
  if (!/^AIza[0-9A-Za-z_-]{35}$/.test(API_KEY)) {
    return `NEXT_PUBLIC_GOOGLE_API_KEY no parece una clave de API de Google (debe empezar con «AIza» y medir 39 caracteres, sin comillas ni espacios). ${forma(API_KEY)}`;
  }
  if (!/^[0-9]+-[0-9a-z]+\.apps\.googleusercontent\.com$/.test(CLIENT_ID)) {
    return `NEXT_PUBLIC_GOOGLE_CLIENT_ID no parece un ID de cliente (debe terminar en «.apps.googleusercontent.com»). ${forma(CLIENT_ID)}`;
  }
  if (!/^[0-9]{6,20}$/.test(APP_ID)) {
    return `NEXT_PUBLIC_GOOGLE_APP_ID debe ser solo el número del proyecto (unos 12 dígitos, sin letras). ${forma(APP_ID)}`;
  }
  return "";
}

export const driveConfigurado = (): boolean => Boolean(CLIENT_ID && API_KEY && APP_ID);

const PERMISO = "https://www.googleapis.com/auth/drive.file";
const API = "https://www.googleapis.com/drive/v3/files";
const MIME_HOJA = "application/vnd.google-apps.spreadsheet";
const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MIMES = [MIME_HOJA, MIME_XLSX, "text/csv", "application/vnd.ms-excel"].join(",");

export type ArchivoDrive = { id: string; nombre: string; mime: string; token: string };

function cargarScript(src: string): Promise<void> {
  return new Promise((ok, mal) => {
    const falla = () => mal(new Error("No se pudo cargar Google. Revisa la conexión a internet."));
    const previo = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (previo) {
      if (previo.dataset.listo) ok();
      else { previo.addEventListener("load", () => ok()); previo.addEventListener("error", falla); }
      return;
    }
    const s = document.createElement("script");
    s.src = src; s.async = true;
    s.onload = () => { s.dataset.listo = "1"; ok(); };
    s.onerror = falla;
    document.head.appendChild(s);
  });
}

/** Carga los scripts de Google antes del toque, para que el botón abra la ventana de Google en el mismo toque:
 *  Safari (iPhone) bloquea las ventanas que se abren después de esperar algo. Llamarla al mostrar el botón. */
export function prepararDrive(): void {
  if (typeof window === "undefined" || !driveConfigurado() || (window as any).pywebview?.api) return;
  Promise.all([cargarScript("https://accounts.google.com/gsi/client"), cargarScript("https://apis.google.com/js/api.js")]).catch(() => {});
}

/** iPhone o iPad: Safari no deja al selector de Google Drive (que va dentro de un recuadro) usar la sesión de Google
 *  («No se puede acceder a tu cuenta de Google»). Ahí se usa la app Archivos o el enlace pegado. */
export const esIos = (): boolean =>
  typeof navigator !== "undefined" && (/iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1))
  // Chrome, Firefox y Edge del iPhone no aplican el bloqueo de Safari: ahí se intenta el selector normal.
  && !/CriOS|FxiOS|EdgiOS/i.test(navigator.userAgent);

const googleListo = () => Boolean((window as any).google?.accounts?.oauth2 && (window as any).gapi);

/** iPhone o iPad con Prezcio abierto desde el ícono de la pantalla de inicio. */
const appInstaladaEnIos = () =>
  /iPhone|iPad|iPod/i.test(navigator.userAgent) && ((navigator as any).standalone === true || window.matchMedia("(display-mode: standalone)").matches);

const AVISO_VENTANA = () => appInstaladaEnIos()
  ? "En la app instalada del iPhone, Google no puede abrir su ventana. Abre esta página en Safari (prezcio.app) para elegir el archivo de Drive, o sube el Excel desde «Elige un archivo»."
  : "No se pudo abrir la ventana de Google. Permite las ventanas emergentes de prezcio.app e intenta de nuevo.";

/** Pide el permiso a Google (ventana emergente). Devuelve null si la persona cierra la ventana. */
async function pedirPermiso(): Promise<string | null> {
  // Dentro de la app Prezcio Administrador (Windows) Google no deja iniciar sesión en la ventana incrustada:
  // la app abre el navegador del equipo, recibe el permiso y se lo pasa a esta página.
  const puente = (window as any).pywebview?.api;
  if (typeof puente?.google_token === "function") {
    const r = await puente.google_token();
    if (r?.token) return String(r.token);
    if (r?.cancelado) return null;
    throw new Error(r?.error || "No se pudo conectar con Google Drive.");
  }
  return new Promise((ok, mal) => {
    const g = (window as any).google;
    const cliente = g.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: PERMISO,
      callback: (r: any) => {
        if (r?.access_token) ok(r.access_token);
        else if (r?.error === "access_denied") ok(null);
        else mal(new Error("Google no dio acceso a Drive. Intenta de nuevo."));
      },
      error_callback: (e: any) => {
        if (e?.type === "popup_closed") ok(null);
        else mal(new Error(AVISO_VENTANA()));
      },
    });
    cliente.requestAccessToken({ prompt: "" });
  });
}

/** Google solo acepta el selector en las direcciones registradas en Google Cloud (prezcio.app), no en la dirección
 *  propia de cada negocio (onetech.prezcio.app). Desde ahí se pasa a la misma página en prezcio.app: la sesión es
 *  la misma porque la cookie vale para todo prezcio.app. Devuelve la dirección a la que hay que ir, o "" si no hace falta. */
export function paginaParaDrive(): string {
  if (typeof window === "undefined") return "";
  const { hostname, pathname, search, protocol } = window.location;
  const partes = hostname.split(".");
  if (partes.length < 3 || partes[0] === "www" || /^\d+$/.test(partes[partes.length - 1])) return "";
  const slug = partes[0], base = partes.slice(1).join(".");
  const ruta = pathname.startsWith(`/n/${slug}`) ? pathname : `/n/${slug}${pathname === "/" ? "" : pathname}`;
  const q = new URLSearchParams(search); q.set("drive", "1");
  return `${protocol}//${base}${ruta}?${q.toString()}`;
}

/** Abre el selector de Google Drive. Devuelve el archivo elegido, o null si la persona cancela. */
export async function elegirArchivoDrive(): Promise<ArchivoDrive | null> {
  if (!driveConfigurado()) throw new Error("Falta configurar Google Drive en Prezcio.");
  // Dentro de la app Prezcio Administrador (Windows) el selector de Google no funciona en la ventana incrustada
  // (bloquea sus cookies): la app abre /google-elegir en el navegador del equipo y recibe de vuelta el archivo elegido.
  const puente = (window as any).pywebview?.api;
  if (typeof puente?.google_elegir === "function") {
    const r = await puente.google_elegir();
    if (r?.id && r?.token) return { id: String(r.id), nombre: String(r.nombre || "Archivo"), mime: String(r.mime || ""), token: String(r.token) };
    if (r?.cancelado) return null;
    throw new Error(r?.error || "No se pudo abrir Google Drive.");
  }
  const aviso = revisarConfiguracionDrive();
  if (aviso) throw new Error(aviso);
  const ir = paginaParaDrive();
  if (ir) { window.location.assign(ir); return new Promise<null>(() => {}); }   // la página se va; el toque se repite allá
  // Si Google ya está cargado, la ventana se abre en este mismo toque (sin esperar nada antes).
  const token = googleListo()
    ? await pedirPermiso()
    : await (async () => {
        await Promise.all([cargarScript("https://accounts.google.com/gsi/client"), cargarScript("https://apis.google.com/js/api.js")]);
        return pedirPermiso();
      })();
  if (!token) return null;
  await new Promise<void>((ok) => (window as any).gapi.load("picker", { callback: ok }));
  const g = (window as any).google;
  return new Promise<ArchivoDrive | null>((ok) => {
    // Sin carpetas: Google muestra una lista plana con solo los Excel (y hojas de Google), de cualquier lugar del Drive.
    const vista = () => new g.picker.DocsView(g.picker.ViewId.DOCS)
      .setIncludeFolders(false).setMimeTypes(MIMES).setMode(g.picker.DocsViewMode.LIST);
    const mias = vista();
    const compartidas = vista().setOwnedByMe(false);
    const selector = new g.picker.PickerBuilder()
      .setAppId(APP_ID)
      .setDeveloperKey(API_KEY)
      .setOAuthToken(token)
      .setLocale("es")
      .setTitle("Elige el Excel o la hoja de Google")
      .addView(mias)
      .addView(compartidas)
      .setCallback((r: any) => {
        if (r.action === g.picker.Action.PICKED) {
          const d = r.docs?.[0];
          ok(d ? { id: String(d.id), nombre: String(d.name ?? "Archivo"), mime: String(d.mimeType ?? ""), token } : null);
        } else if (r.action === g.picker.Action.CANCEL) ok(null);
      })
      .build();
    selector.setVisible(true);
  });
}

/** Enlace normal del archivo elegido (el mismo que el cliente pegaría a mano). */
export function enlaceDeArchivo(a: ArchivoDrive): string {
  return a.mime === MIME_HOJA
    ? `https://docs.google.com/spreadsheets/d/${a.id}/edit`
    : `https://drive.google.com/file/d/${a.id}/view`;
}

/** Descarga el archivo elegido (sin necesidad de compartirlo) y lo deja listo para leer. */
export async function descargarDeDrive(a: ArchivoDrive): Promise<{ name: string; arrayBuffer(): Promise<ArrayBuffer> }> {
  const esHoja = a.mime === MIME_HOJA;
  const url = esHoja
    ? `${API}/${a.id}/export?mimeType=${encodeURIComponent(MIME_XLSX)}`
    : `${API}/${a.id}?alt=media&supportsAllDrives=true`;
  let r: Response;
  try { r = await fetch(url, { headers: { Authorization: `Bearer ${a.token}` } }); }
  catch { throw new Error("No se pudo descargar el archivo de Google Drive. Revisa la conexión."); }
  if (!r.ok) throw new Error(`Google Drive no dejó leer el archivo (${r.status}).`);
  const datos = await r.arrayBuffer();
  const name = esHoja && !/\.xlsx$/i.test(a.nombre) ? `${a.nombre}.xlsx` : a.nombre;
  return { name, arrayBuffer: async () => datos };
}

/** Deja el archivo como «Cualquier persona con el enlace · Lector» para que Prezcio lo actualice solo.
 *  Devuelve un texto de error, o "" si quedó bien. Solo funciona si la persona es dueña o editora del archivo. */
export async function compartirPorEnlace(a: ArchivoDrive): Promise<string> {
  try {
    const r = await fetch(`${API}/${a.id}/permissions?supportsAllDrives=true`, {
      method: "POST",
      headers: { Authorization: `Bearer ${a.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    });
    if (r.ok) return "";
    return r.status === 403
      ? "No tienes permiso para compartir este archivo. Pídele al dueño que lo comparta como «Cualquier persona con el enlace»."
      : `Google no dejó compartir el archivo (${r.status}).`;
  } catch {
    return "No se pudo compartir el archivo. Revisa la conexión.";
  }
}

export function nombreSinExtension(nombre: string): string {
  return nombre.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim().slice(0, 80);
}
