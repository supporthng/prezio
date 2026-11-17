/**
 * Da de alta «<negocio>.prezcio.app» en el proyecto de Vercel, para que tenga su certificado.
 * Variables (Vercel › Settings › Environment Variables, marcadas como Sensitive):
 *   VERCEL_TOKEN        token con acceso al equipo del proyecto
 *   VERCEL_PROJECT_ID   id del proyecto (prj_…)
 *   VERCEL_TEAM_ID      id del equipo (team_…)
 * Sin ellas no hace nada: el enlace largo /n/<negocio> sigue funcionando.
 */
export function vercelListo() {
  return Boolean(process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID);
}

/** El token tal cual, aunque se haya pegado con «Bearer», comillas o espacios. */
function token() {
  const v = (process.env.VERCEL_TOKEN ?? "").trim();
  const m = v.match(/[A-Za-z0-9_-]{20,}(?=["'\s]*$)/);
  return m ? m[0] : v.replace(/^Bearer\s+/i, "");
}

type ErrorVercel = { error?: { code?: string; message?: string } } | null;

async function llamar(ruta: string, init: RequestInit = {}) {
  return fetch(`https://api.vercel.com${ruta}`, {
    ...init,
    cache: "no-store",
    headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(15000),
  });
}

/** Equipos donde probar: el de VERCEL_TEAM_ID y los que el token puede ver (si el proyecto se movió de equipo). */
async function equipos(): Promise<string[]> {
  const lista = [process.env.VERCEL_TEAM_ID?.trim() ?? ""].filter(Boolean);
  try {
    const r = await llamar("/v2/teams?limit=20");
    if (r.ok) for (const t of ((await r.json()) as { teams?: { id: string }[] }).teams ?? []) if (!lista.includes(t.id)) lista.push(t.id);
  } catch { /* sigue con lo que hay */ }
  return [...lista, ""];
}

/** Qué ve el token (sin mostrarlo): si es válido, qué equipos alcanza y si ve el proyecto. */
async function diagnostico(): Promise<string> {
  const partes: string[] = [`token de ${token().length} caracteres`];
  try {
    const u = await llamar("/v2/user");
    partes.push(u.ok ? "token válido" : `token inválido (HTTP ${u.status})`);
    const t = await llamar("/v2/teams?limit=20");
    const lista = t.ok ? (((await t.json()) as { teams?: { slug: string }[] }).teams ?? []).map((x) => x.slug) : [];
    partes.push(t.ok ? `equipos: ${lista.join(", ") || "ninguno"}` : `equipos: HTTP ${t.status}`);
    const eq = process.env.VERCEL_TEAM_ID?.trim();
    const p = await llamar(`/v9/projects/${encodeURIComponent(process.env.VERCEL_PROJECT_ID!.trim())}${eq ? `?teamId=${encodeURIComponent(eq)}` : ""}`);
    partes.push(p.ok ? "ve el proyecto" : `proyecto: HTTP ${p.status}`);
  } catch (e) {
    partes.push(e instanceof Error ? e.message : "sin respuesta");
  }
  return partes.join(" · ");
}

export async function agregarSubdominio(host: string): Promise<string | null> {
  if (!vercelListo()) return "sin configurar";
  const proyectos = [...new Set([process.env.VERCEL_PROJECT_ID!.trim(), "prezio"])];
  let rechazado = false, ultimo = "";
  try {
    for (const equipo of await equipos()) {
      for (const proyecto of proyectos) {
        const r = await llamar(`/v10/projects/${encodeURIComponent(proyecto)}/domains${equipo ? `?teamId=${encodeURIComponent(equipo)}` : ""}`,
          { method: "POST", body: JSON.stringify({ name: host }) });
        if (r.ok) return null;
        const d = (await r.json().catch(() => null)) as ErrorVercel;
        if (d?.error?.code === "domain_already_in_use" || d?.error?.code === "domain_already_exists") return null;
        if (r.status === 401 || r.status === 403 || r.status === 404) { rechazado ||= r.status !== 404; ultimo = d?.error?.message ?? `HTTP ${r.status}`; continue; }
        return d?.error?.message ?? `HTTP ${r.status}`;
      }
    }
  } catch (e) {
    return e instanceof Error ? e.message : "sin respuesta";
  }
  return `${rechazado ? "Vercel no aceptó el token para el proyecto" : "No encontré el proyecto en Vercel"}. Detalle: ${ultimo} · ${await diagnostico()}`;
}
