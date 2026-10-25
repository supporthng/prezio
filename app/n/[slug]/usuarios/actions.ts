"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { supabaseAdmin, problemaClaveSecreta, errorDeCuentas, correoDeUsuario, USUARIO_VALIDO } from "@/lib/supabase/admin";
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

export async function crearUsuario(datos: FormData) {
  const slug = campo(datos, "slug"), negocio = campo(datos, "negocio");
  const usuario = campo(datos, "usuario").toLowerCase(), nombre = campo(datos, "nombre"), clave = String(datos.get("clave") ?? "");
  const { permisos, sucursales, error: e0 } = permisosDe(datos);
  if (e0) volver(slug, e0);
  if (!USUARIO_VALIDO.test(usuario)) volver(slug, "El usuario: de 3 a 30 letras minúsculas, números, punto, guion o guion bajo, sin espacios.");
  if (clave.length < 8) volver(slug, "La clave debe tener al menos 8 caracteres.");
  { const p = problemaClaveSecreta(); if (p) volver(slug, p); }
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
  if (e1 || !creada.user) volver(slug, /already|registered|exists/i.test(e1?.message ?? "") ? `Ya existe el usuario «${usuario}» en este negocio.` : errorDeCuentas(e1) ?? e1);
  // 3. Se suma al negocio con la sesión de quien pide (la base vuelve a revisar todo).
  const { error: e2 } = await supabase.rpc("agregar_usuario", {
    p_negocio: negocio, p_cuenta: creada.user!.id, p_usuario: usuario, p_nombre: nombre, p_permisos: permisos, p_sucursales: sucursales,
  });
  if (e2) {
    await admin.auth.admin.deleteUser(creada.user!.id).catch(() => {});
    volver(slug, e2);
  }
  const nivel = campo(datos, "nivel");
  if (nivel) {
    const { error: e3 } = await supabase.rpc("cambiar_acceso", {
      p_negocio: negocio, p_usuario: creada.user!.id, p_nivel: nivel, p_permisos: null, p_sucursales: sucursales,
    });
    if (e3) volver(slug, e3);
  }
  const { data: lic } = await supabase.from("negocios").select("licencia").eq("id", negocio).maybeSingle();
  volver(slug, null, `Usuario «${usuario}» creado. Entra en Prezio › Entrar › Con usuario, con la licencia ${(lic as { licencia?: string } | null)?.licencia ?? slug}.`);
}

export async function guardarPermisos(datos: FormData) {
  const slug = campo(datos, "slug");
  const { permisos, sucursales, error: e0 } = permisosDe(datos);
  if (e0) volver(slug, e0);
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("cambiar_acceso", {
    p_negocio: campo(datos, "negocio"), p_usuario: campo(datos, "cuenta"), p_nivel: campo(datos, "nivel") || null,
    p_permisos: permisos, p_sucursales: sucursales,
  });
  volver(slug, error, "Acceso guardado. Se aplica en su próxima página.");
}

export async function cambiarClave(datos: FormData) {
  const slug = campo(datos, "slug"), negocio = campo(datos, "negocio"), cuenta = campo(datos, "cuenta");
  const clave = String(datos.get("clave") ?? "");
  if (clave.length < 8) volver(slug, "La clave debe tener al menos 8 caracteres.");
  { const p = problemaClaveSecreta(); if (p) volver(slug, p); }
  const supabase = await supabaseServidor();
  const { data: puede } = await supabase.rpc("puede_administrar_usuario", { p_negocio: negocio, p_cuenta: cuenta });
  if (!puede) volver(slug, "No puedes cambiar la clave de esa persona.");
  const { error } = await supabaseAdmin().auth.admin.updateUserById(cuenta, { password: clave });
  volver(slug, errorDeCuentas(error) ?? error, "Clave cambiada. Ya puede entrar con la nueva.");
}

export async function quitarUsuario(datos: FormData) {
  const slug = campo(datos, "slug"), negocio = campo(datos, "negocio"), cuenta = campo(datos, "cuenta");
  const supabase = await supabaseServidor();
  const { data: sinCorreo } = await supabase.rpc("puede_administrar_usuario", { p_negocio: negocio, p_cuenta: cuenta });
  const { error } = await supabase.rpc("quitar_miembro", { p_negocio: negocio, p_usuario: cuenta });
  if (error) volver(slug, error);
  // Un usuario sin correo solo existe para este negocio: se borra la cuenta para que no pueda entrar más.
  if (sinCorreo && !problemaClaveSecreta()) {
    const admin = supabaseAdmin();
    const { data } = await admin.auth.admin.getUserById(cuenta);
    if (data.user?.email?.endsWith(`@n${negocio.replace(/-/g, "")}.prezio.invalid`)) await admin.auth.admin.deleteUser(cuenta).catch(() => {});
  }
  volver(slug, null, "Quitado del negocio.");
}

export async function guardarNivel(datos: FormData) {
  const slug = campo(datos, "slug");
  const permisos = datos.getAll("permiso").map(String).filter((p) => (PERMISOS as readonly string[]).includes(p));
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("guardar_nivel", {
    p_negocio: campo(datos, "negocio"), p_nivel: campo(datos, "nivel") || null, p_nombre: campo(datos, "nombre"),
    p_descripcion: campo(datos, "descripcion"), p_permisos: permisos, p_por_sucursal: campo(datos, "por_sucursal") === "si",
  });
  volver(slug, error, campo(datos, "nivel") ? "Nivel guardado: las personas con este nivel ya tienen las casillas nuevas." : "Nivel creado.");
}

export async function borrarNivel(datos: FormData) {
  const slug = campo(datos, "slug");
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("borrar_nivel", { p_nivel: campo(datos, "nivel") });
  volver(slug, error, "Nivel borrado. Quienes lo tenían conservan sus casillas (quedan como «Personalizado»).");
}
