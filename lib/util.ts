/** Solo rutas internas de la app como destino tras entrar (evita redirigir a otro sitio). */
export function rutaSegura(valor: unknown, porDefecto = "/negocios"): string {
  const texto = typeof valor === "string" ? valor : "";
  return texto.startsWith("/") && !texto.startsWith("//") && !texto.startsWith("/\\") ? texto : porDefecto;
}

/** Mensaje de error de Supabase en palabras simples. */
export function mensajeError(error: { message?: string; code?: string } | null | undefined): string {
  const m = error?.message ?? "";
  if (/Invalid login credentials/i.test(m)) return "Correo o clave incorrectos.";
  if (/Email not confirmed/i.test(m)) return "Confirma tu correo: te enviamos un enlace al registrarte.";
  if (/User already registered/i.test(m)) return "Ya existe una cuenta con ese correo. Entra con tu clave.";
  if (/Password should be at least/i.test(m)) return "La clave debe tener al menos 8 caracteres.";
  if (/rate limit/i.test(m)) return "Demasiados intentos. Espera un minuto y vuelve a probar.";
  if (/duplicate key/i.test(m)) return "Ya existe uno con ese nombre.";
  return m || "No se pudo completar. Inténtalo de nuevo.";
}

export const ROLES: Record<string, string> = {
  dueno: "Dueño",
  admin: "Administrador",
  encargado: "Encargado de sucursal",
  verificador: "Verificador",
};

export function sitio(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
}
