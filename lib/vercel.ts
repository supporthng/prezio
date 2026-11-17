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

export async function agregarSubdominio(host: string): Promise<string | null> {
  if (!vercelListo()) return "sin configurar";
  const equipo = process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : "";
  try {
    const r = await fetch(`https://api.vercel.com/v10/projects/${encodeURIComponent(process.env.VERCEL_PROJECT_ID!)}/domains${equipo}`, {
      method: "POST",
      cache: "no-store",
      headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
      body: JSON.stringify({ name: host }),
      signal: AbortSignal.timeout(15000),
    });
    if (r.ok) return null;
    const d = (await r.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    if (d?.error?.code === "domain_already_in_use" || d?.error?.code === "domain_already_exists") return null;
    if (r.status === 401 || r.status === 403 || /not authorized|forbidden/i.test(d?.error?.message ?? ""))
      return "Vercel no aceptó el token (VERCEL_TOKEN): créalo con alcance del equipo del proyecto, pégalo sin espacios y vuelve a publicar";
    return d?.error?.message ?? `HTTP ${r.status}`;
  } catch (e) {
    return e instanceof Error ? e.message : "sin respuesta";
  }
}
