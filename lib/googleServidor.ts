import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, createHash } from "node:crypto";

/** Google Drive conectado desde el servidor (funciona en Safari: no usa la ventana incrustada de Google).
 *
 *  Necesita en Vercel (Sensitive): GOOGLE_CLIENT_SECRET, el «Secreto del cliente» del mismo ID de cliente OAuth que
 *  NEXT_PUBLIC_GOOGLE_CLIENT_ID. El permiso que da el cliente (refresh token) se guarda cifrado con una clave que sale
 *  de ese secreto: sin el servidor de Prezcio, lo guardado en la base no sirve para nada. */

const CLIENT_ID = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "").trim();
const SECRETO = (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
export const PERMISOS_DRIVE = "openid email https://www.googleapis.com/auth/drive.readonly";

export const driveServidorListo = (): boolean => Boolean(CLIENT_ID && SECRETO);

function clave(): Buffer {
  if (!SECRETO) throw new Error("Falta GOOGLE_CLIENT_SECRET en Vercel.");
  return Buffer.from(hkdfSync("sha256", SECRETO, "prezcio", "tokens-google-drive", 32));
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", clave(), iv);
  const datos = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${Buffer.concat([datos, c.getAuthTag()]).toString("base64url")}`;
}

export function descifrar(guardado: string): string {
  const [v, iv, resto] = guardado.split(".");
  if (v !== "v1" || !iv || !resto) throw new Error("Conexión de Google Drive dañada: vuelve a conectarla.");
  const b = Buffer.from(resto, "base64url");
  const d = createDecipheriv("aes-256-gcm", clave(), Buffer.from(iv, "base64url"));
  d.setAuthTag(b.subarray(b.length - 16));
  return Buffer.concat([d.update(b.subarray(0, b.length - 16)), d.final()]).toString("utf8");
}

export function pkce(): { verificador: string; reto: string } {
  const verificador = randomBytes(48).toString("base64url");
  return { verificador, reto: createHash("sha256").update(verificador).digest("base64url") };
}

export function enlaceAutorizar(redirect: string, estado: string, reto: string): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: redirect, response_type: "code", scope: PERMISOS_DRIVE,
    access_type: "offline", prompt: "consent", include_granted_scopes: "true",
    state: estado, code_challenge: reto, code_challenge_method: "S256",
  }).toString();
  return u.toString();
}

/** Cambia el código de Google por el permiso duradero (refresh token) y el correo de la cuenta. */
export async function canjearCodigo(codigo: string, redirect: string, verificador: string): Promise<{ refresh: string; correo: string }> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: codigo, client_id: CLIENT_ID, client_secret: SECRETO, redirect_uri: redirect,
      grant_type: "authorization_code", code_verifier: verificador }),
    cache: "no-store",
  });
  const d = (await r.json().catch(() => ({}))) as { refresh_token?: string; id_token?: string; scope?: string; error?: string; error_description?: string };
  if (!r.ok) throw new Error(`Google no aceptó la conexión (${d.error_description || d.error || r.status}).`);
  if (!d.scope?.includes("drive.readonly")) throw new Error("No se marcó el permiso para ver tus archivos de Drive. Conecta de nuevo y deja marcada esa casilla.");
  if (!d.refresh_token) throw new Error("Google no entregó el permiso duradero. Conecta de nuevo.");
  let correo = "";
  try { correo = String(JSON.parse(Buffer.from((d.id_token ?? "").split(".")[1] ?? "", "base64url").toString("utf8")).email ?? ""); } catch { /* sin correo */ }
  if (!correo) throw new Error("Google no indicó el correo de la cuenta. Conecta de nuevo.");
  return { refresh: d.refresh_token, correo };
}

/** Permiso de una hora a partir del token cifrado guardado. */
export async function accesoDesde(cifrado: string): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: SECRETO, refresh_token: descifrar(cifrado), grant_type: "refresh_token" }),
    cache: "no-store",
  });
  const d = (await r.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (d.error === "invalid_grant") throw new Error("La conexión con Google Drive se venció o se quitó. Vuelve a conectar Google Drive en Inventarios.");
  if (!r.ok || !d.access_token) throw new Error("Google no respondió. Se intentará de nuevo.");
  return d.access_token;
}

export async function revocar(cifrado: string): Promise<void> {
  try {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: descifrar(cifrado) }), cache: "no-store",
    });
  } catch { /* si falla, igual se borró de Prezcio */ }
}

export type ArchivoLista = { id: string; nombre: string; mime: string; modificado: string; url: string };
const MIME_HOJA = "application/vnd.google-apps.spreadsheet";
const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Las hojas de Google, Excel y CSV de la cuenta, más recientes primero; con búsqueda por nombre. */
export async function listarHojas(acceso: string, buscar = ""): Promise<ArchivoLista[]> {
  const filtro = [`(mimeType='${MIME_HOJA}' or mimeType='${MIME_XLSX}' or mimeType='text/csv')`, "trashed=false"];
  const t = buscar.trim().slice(0, 80).replace(/\\/g, "").replace(/'/g, "\\'");
  if (t) filtro.push(`name contains '${t}'`);
  const u = new URL("https://www.googleapis.com/drive/v3/files");
  u.search = new URLSearchParams({
    q: filtro.join(" and "), pageSize: "50", orderBy: "modifiedTime desc",
    fields: "files(id,name,mimeType,modifiedTime)", includeItemsFromAllDrives: "true", supportsAllDrives: "true", corpora: "allDrives",
  }).toString();
  const r = await fetch(u, { headers: { Authorization: `Bearer ${acceso}` }, cache: "no-store" });
  if (!r.ok) throw new Error(`Google Drive no dejó ver la lista (${r.status}).`);
  const d = (await r.json()) as { files?: { id: string; name: string; mimeType: string; modifiedTime: string }[] };
  return (d.files ?? []).map((f) => ({
    id: f.id, nombre: f.name, mime: f.mimeType, modificado: f.modifiedTime,
    url: f.mimeType === MIME_HOJA ? `https://docs.google.com/spreadsheets/d/${f.id}/edit` : `https://drive.google.com/file/d/${f.id}/view`,
  }));
}
