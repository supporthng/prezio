/** Variables de Supabase (Vercel › Settings › Environment Variables). Se leen al compilar: tras
 *  agregarlas o cambiarlas hay que volver a publicar (Deployments › Redeploy). */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// Supabase la llama «publishable» (sb_publishable_…); los proyectos anteriores, «anon». Vale cualquiera.
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Nombres de las variables que faltan (vacío = todo configurado). */
export function variablesFaltantes(): string[] {
  const faltan: string[] = [];
  if (!/^https:\/\/.+/.test(SUPABASE_URL)) faltan.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!SUPABASE_KEY) faltan.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return faltan;
}
