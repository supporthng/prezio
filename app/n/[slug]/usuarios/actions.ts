"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { supabaseAdmin, hayClaveSecreta, correoDeUsuario, USUARIO_VALIDO } from "@/lib/supabase/admin";
import { PERMISOS } from "@/lib/permisos";
import { mensajeError } from "@/lib/util";

const campo = (d: FormData, n: string) => String(d.get(n) ?? "").trim();
const volver = (slug: string, error: unknown, bien = ""): never => {
  revalidatePath(`/n/${slug}/usuarios`);
  redirect(`/n/${slug}/usuarios?${error ? "error=" + encodeURIComponent(typeof error === "string" ? error : mensajeError(error as { message?: string })) : "bien=" + encodeURIComponent(bien)}`);
};
/** Casillas marcadas y sucursales («todas» = null). */
function permisosDe(d: FormData): { permisos: string[]; sucursales: string[] | null; error?: string } {
  const permisos = d.getAll("permiso").map(String).filter((p) => (PERMISOS as readonly string[]).includes(p));
  if (campo(d, "alcance") !== "algunas") return { permisos, sucursales: null };
  const sucursales = [...new Set(d.getAll("sucursal").map(String).filter(Boolean))];
  return sucursales.length ? { permisos, sucursales } : { permisos, sucursales, error: "Marca al menos una sucursal (o elige «Todas»)." };
}
const SIN_CLAVE_SECRETA = "Falta configurar la clave secreta de Supabase en Vercel (SUPABASE_SECRET_KEY). Mira el README › Usuarios sin correo.";

export async function crearUsuario(datos: FormData) {
  const slug = campo(datos, "slug"), negocio = campo(datos, "negocio");
  const usuario = campo(datos, "usuario").toLowerCase(), nombre = campo(datos, "nombre"), clave = String(datos.get("clave") ?? "");
  const { permisos, sucursales, error: e0 } = permisosDe(datos);
  if (e0) volver(slug, e0);
  if (!USUARIO_VALIDO.test(usuario)) volver(slug, "El usuario: de 3 a 30 letras minúsculas, números, punto, guion o guion bajo, sin espacios.");
  if (clave.length < 8) volver(slug, "La clave debe tener al menos 8 caracteres.");
  if (!hayClaveSecreta()) volver(slug, SIN_CLAVE_SECRETA);
  const supabase = await supabaseServidor();
  // 1. La base confirma que QUIEN PIDE puede crear usuarios con esas casillas.
  const [{ data: puedeUsuarios }, { data: puedeDar }] = await Promise.all([
    supabase.rpc("puede", { p_negocio: negocio, p_permiso: "usuarios" }),
    supabase.rpc("puede_dar", { p_negocio: negocio, p_permisos: permisos, p_sucursales: sucursales }),
  ]);
  if (!puedeUsuarios || !puedeDar) volver(slug, "No puedes crear usuarios con esos permisos.");
  // 2. Recién entonces se crea la cuenta (sin correo real, ya confirmada).
  const admin = supabaseAdmin();
  const { data: creada, error: e1 } = await admin.auth.admin.createUser({
    email: correoDeUsuario(negocio, usuario), password: clave, email_confirm: true, user_metadata: { nombre, usuario },
  });
  if (e1 || !creada.user) volver(slug, /already|registered|exists/i.test(e1?.message ?? "") ? `Ya existe el usuario «${usuario}» en este negocio.` : e1);
  // 3. Se suma al negocio con la sesión de quien pide (la base vuelve a revisar todo).
  const { error: e2 } = await supabase.rpc("agregar_usuario", {
    p_negocio: negocio, p_cuenta: creada.user!.id, p_usuario: usuario, p_nombre: nombre, p_permisos: permisos, p_sucursales: sucursales,
  });
  if (e2) {
    await admin.auth.admin.deleteUser(creada.user!.id).catch(() => {});
    volver(slug, e2);
  }
  volver(slug, null, `Usuario «${usuario}» creado. Entra en Prezio › Entrar › Con usuario, con el código «${slug}».`);
}

export async function guardarPermisos(datos: FormData) {
  const slug = campo(datos, "slug");
  const { permisos, sucursales, error: e0 } = permisosDe(datos);
  if (e0) volver(slug, e0);
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("cambiar_permisos", {
    p_negocio: campo(datos, "negocio"), p_usuario: campo(datos, "cuenta"), p_permisos: permisos, p_sucursales: sucursales,
  });
  volver(slug, error, "Permisos guardados. Se aplican en su próxima página.");
}

export async function cambiarClave(datos: FormData) {
  const slug = campo(datos, "slug"), negocio = campo(datos, "negocio"), cuenta = campo(datos, "cuenta");
  const clave = String(datos.get("clave") ?? "");
  if (clave.length < 8) volver(slug, "La clave debe tener al menos 8 caracteres.");
  if (!hayClaveSecreta()) volver(slug, SIN_CLAVE_SECRETA);
  const supabase = await supabaseServidor();
  const { data: puede } = await supabase.rpc("puede_administrar_usuario", { p_negocio: negocio, p_cuenta: cuenta });
  if (!puede) volver(slug, "No puedes cambiar la clave de esa persona.");
  const { error } = await supabaseAdmin().auth.admin.updateUserById(cuenta, { password: clave });
  volver(slug, error, "Clave cambiada. Ya puede entrar con la nueva.");
}

export async function quitarUsuario(datos: FormData) {
  const slug = campo(datos, "slug"), negocio = campo(datos, "negocio"), cuenta = campo(datos, "cuenta");
  const supabase = await supabaseServidor();
  const { data: sinCorreo } = await supabase.rpc("puede_administrar_usuario", { p_negocio: negocio, p_cuenta: cuenta });
  const { error } = await supabase.rpc("quitar_miembro", { p_negocio: negocio, p_usuario: cuenta });
  if (error) volver(slug, error);
  // Un usuario sin correo solo existe para este negocio: se borra la cuenta para que no pueda entrar más.
  if (sinCorreo && hayClaveSecreta()) {
    const admin = supabaseAdmin();
    const { data } = await admin.auth.admin.getUserById(cuenta);
    if (data.user?.email?.endsWith(`@n${negocio.replace(/-/g, "")}.prezio.invalid`)) await admin.auth.admin.deleteUser(cuenta).catch(() => {});
  }
  volver(slug, null, "Quitado del negocio.");
}
