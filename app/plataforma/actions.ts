"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServidor } from "@/lib/supabase/server";
import { supabaseAdmin, problemaClaveSecreta, errorDeCuentas, correoDeUsuario, USUARIO_VALIDO } from "@/lib/supabase/admin";
import { mensajeError, sitio } from "@/lib/util";
import { dominioBase, enlaceNegocio } from "@/lib/subdominio";
import { agregarSubdominio, quitarSubdominio, vercelListo } from "@/lib/vercel";

const campo = (d: FormData, n: string) => String(d.get(n) ?? "").trim();
const volver = (error: unknown, bien = "", d?: FormData): never => {
  revalidatePath("/plataforma");
  // Vuelve a la misma pestaña de la Plataforma desde la que se mandó el formulario.
  const v = d ? campo(d, "vista") : "";
  const vista = /^[a-z]{3,12}$/.test(v) ? `&vista=${v}` : "";
  redirect(`/plataforma?${error ? "error=" + encodeURIComponent(typeof error === "string" ? error : mensajeError(error as { message?: string })) : "bien=" + encodeURIComponent(bien)}${vista}`);
};

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function soloPlataforma() {
  const supabase = await supabaseServidor();
  const { data } = await supabase.rpc("es_plataforma");
  if (!data) volver("Solo la plataforma puede hacer esto.");
  { const p = problemaClaveSecreta(); if (p) volver(p); }
  return supabase;
}

/** Le pone dueño a un negocio: cuenta sin correo (usuario + clave) o invitación por correo. Devuelve el aviso. */
async function ponerDueno(supabase: SupabaseClient, negocio: { id: string; slug: string }, d: FormData): Promise<{ error?: string; bien?: string }> {
  const nombre = campo(d, "dueno_nombre").slice(0, 80);
  const admin = supabaseAdmin();
  if (campo(d, "acceso") === "correo") {
    const correo = campo(d, "correo").toLowerCase();
    if (!CORREO.test(correo) || correo.endsWith(".prezio.invalid")) return { error: "Escribe un correo válido para el dueño." };
    const { data: existe } = await supabase.rpc("plataforma_cuenta_de_correo", { p_correo: correo });
    let cuenta = existe ? String(existe) : "";
    let aviso: string;
    if (cuenta) {
      aviso = `${correo} ya tenía cuenta: entra con su correo y su clave de siempre y verá «${negocio.slug}».`;
    } else {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(correo, {
        redirectTo: `${sitio()}/auth/sesion?siguiente=${encodeURIComponent(`/n/${negocio.slug}`)}`,
        data: { nombre },
      });
      if (error || !data.user) return { error: errorDeCuentas(error) ?? "No se pudo enviar la invitación: " + mensajeError(error) + ". Revisa el correo propio (SMTP) en Supabase." };
      cuenta = data.user.id;
      aviso = `Invitación enviada a ${correo}: abre el enlace, elige su clave y entra a su negocio.`;
    }
    const { error } = await supabase.rpc("plataforma_poner_dueno", { p_negocio: negocio.id, p_cuenta: cuenta, p_usuario: null, p_nombre: nombre || null });
    return error ? { error: mensajeError(error) } : { bien: aviso };
  }
  const usuario = campo(d, "usuario").toLowerCase(), clave = String(d.get("clave") ?? "");
  const correo = campo(d, "correo").toLowerCase();
  if (!CORREO.test(correo) || correo.endsWith(".prezio.invalid")) return { error: "Escribe el correo del dueño (para contactarlo)." };
  if (!USUARIO_VALIDO.test(usuario)) return { error: "El usuario del dueño: de 3 a 30 letras minúsculas, números, punto, guion o guion bajo." };
  if (clave.length < 8) return { error: "La clave del dueño debe tener al menos 8 caracteres." };
  const { data: creada, error: e1 } = await admin.auth.admin.createUser({
    email: correoDeUsuario(negocio.id, usuario), password: clave, email_confirm: true, user_metadata: { nombre, usuario, correo },
  });
  if (e1 || !creada.user) return { error: /already|registered|exists/i.test(e1?.message ?? "") ? `Ya existe el usuario «${usuario}» en este negocio.` : errorDeCuentas(e1) ?? mensajeError(e1) };
  const { error: e2 } = await supabase.rpc("plataforma_poner_dueno", { p_negocio: negocio.id, p_cuenta: creada.user.id, p_usuario: usuario, p_nombre: nombre || null });
  if (e2) {
    await admin.auth.admin.deleteUser(creada.user.id).catch(() => {});
    return { error: mensajeError(e2) };
  }
  const { data: lic } = await supabase.rpc("plataforma_licencia_de", { p_negocio: negocio.id });
  return { bien: `Entrega al dueño: licencia ${lic ?? negocio.slug}, usuario «${usuario}» y la clave que escribiste. Entra en Prezcio › Entrar › Con usuario, o en la app Prezcio Administrador.` };
}

export async function altaNegocio(d: FormData) {
  const supabase = await soloPlataforma();
  const { data, error } = await supabase.rpc("plataforma_crear_negocio", {
    p_nombre: campo(d, "nombre"), p_slug: campo(d, "slug").toLowerCase() || null,
    p_moneda: campo(d, "moneda") || "RD$", p_plan: campo(d, "plan") || "prueba",
  });
  if (error || !data) volver(error ?? "No se pudo crear el negocio.", "", d);
  const negocio = data as { id: string; slug: string };
  const r = await ponerDueno(supabase, negocio, d);
  if (r.error) {
    // Alta a medias: se deshace para poder repetirla con el mismo código.
    await supabase.rpc("plataforma_borrar_negocio", { p_negocio: negocio.id });
    volver(r.error, "", d);
  }
  let enlace = `${sitio() || "https://prezcio.app"}/n/${negocio.slug}`;
  if (vercelListo()) {
    const corto = enlaceNegocio(sitio(), negocio.slug);
    if (corto.startsWith("https://") && !corto.includes("/n/") && !(await agregarSubdominio(corto.slice(8)))) enlace = corto;
  }
  volver(null, `Negocio «${campo(d, "nombre")}» creado${campo(d, "plan") && campo(d, "plan") !== "prueba" ? "" : " en prueba"}. Su enlace directo: ${enlace} . ${r.bien}`, d);
}

export async function agregarDueno(d: FormData) {
  const supabase = await soloPlataforma();
  const r = await ponerDueno(supabase, { id: campo(d, "negocio"), slug: campo(d, "slug") }, d);
  volver(r.error ?? null, r.bien ?? "", d);
}

/**
 * Cambiar dueño o su correo.
 * modo «cuenta»: el negocio pasa a otra persona con correo (invitada si no tiene cuenta) y los dueños anteriores salen.
 * modo «contacto»: el dueño con usuario y clave sigue igual; solo cambia el correo para contactarlo.
 */
export async function cambiarDueno(d: FormData) {
  const supabase = await soloPlataforma();
  const negocio = { id: campo(d, "negocio"), slug: campo(d, "slug") };
  const correo = campo(d, "correo").toLowerCase();
  const nombre = campo(d, "dueno_nombre").slice(0, 80);
  if (!CORREO.test(correo) || correo.endsWith(".prezio.invalid")) volver("Escribe un correo válido.", "", d);
  if (problemaClaveSecreta()) volver(problemaClaveSecreta(), "", d);
  const admin = supabaseAdmin();

  if (campo(d, "modo") === "contacto") {
    const { data: id, error } = await supabase.rpc("plataforma_dueno_usuario", { p_negocio: negocio.id, p_usuario: campo(d, "usuario") });
    if (error || !id) volver(error ?? "No encontré a ese dueño en el negocio.", "", d);
    const { data: u, error: e1 } = await admin.auth.admin.getUserById(String(id));
    if (e1 || !u.user) volver(mensajeError(e1), "", d);
    const meta = { ...(u.user!.user_metadata ?? {}), correo, ...(nombre ? { nombre } : {}) };
    const { error: e2 } = await admin.auth.admin.updateUserById(String(id), { user_metadata: meta });
    if (e2) volver(mensajeError(e2), "", d);
    await supabase.rpc("anotar_evento", { p_negocio: negocio.id, p_tipo: "correo_dueno", p_detalle: { usuario: campo(d, "usuario"), correo } }).then(() => {}, () => {});
    volver(null, `Correo de contacto del dueño «${campo(d, "usuario")}» cambiado a ${correo}. Sigue entrando con su usuario y clave.`, d);
  }

  const { data: existe } = await supabase.rpc("plataforma_cuenta_de_correo", { p_correo: correo });
  let cuenta = existe ? String(existe) : "";
  let aviso: string;
  if (cuenta) {
    aviso = `${correo} ya tenía cuenta: entra con su correo y su clave de siempre.`;
  } else {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(correo, {
      redirectTo: `${sitio()}/auth/sesion?siguiente=${encodeURIComponent(`/n/${negocio.slug}`)}`,
      data: { nombre },
    });
    if (error || !data.user) volver(errorDeCuentas(error) ?? "No se pudo enviar la invitación: " + mensajeError(error) + ".", "", d);
    cuenta = data.user!.id;
    aviso = `Le enviamos una invitación a ${correo} para crear su clave.`;
  }
  const { data, error } = await supabase.rpc("plataforma_cambiar_dueno", { p_negocio: negocio.id, p_cuenta: cuenta, p_nombre: nombre || null });
  if (error) volver(error, "", d);
  const r = data as { antes: string[]; cuentas: string[] };
  for (const id of r.cuentas ?? []) await admin.auth.admin.deleteUser(id).catch(() => {});
  volver(null, `Dueño cambiado a ${correo}.${r.antes?.length ? ` ${r.antes.join(", ")} ya no tiene acceso a este negocio.` : ""} ${aviso}`, d);
}

export async function cambiarPlan(d: FormData) {
  const supabase = await supabaseServidor();
  const plan = campo(d, "plan");
  const { error } = await supabase.rpc("plataforma_cambiar_plan", { p_negocio: campo(d, "negocio"), p_plan: plan });
  volver(error, plan === "suspendido" ? "Negocio suspendido: sus verificadores dejan de mostrar precios en su próxima revisión."
    : "Plan guardado. Si estaba suspendido, ya volvió a funcionar.", d);
}

export async function registrarPago(d: FormData) {
  const supabase = await supabaseServidor();
  const meses = Number(campo(d, "meses")) || null;
  const { data, error } = await supabase.rpc("plataforma_registrar_pago", {
    p_negocio: campo(d, "negocio"), p_plan: campo(d, "plan"), p_meses: meses, p_nota: campo(d, "nota") || null,
  });
  const r = data as { pagado_hasta?: string; permanente?: boolean } | null;
  volver(error, r?.permanente ? "Pago registrado: licencia permanente, sin vencimiento."
    : `Pago registrado: licencia activa hasta el ${r?.pagado_hasta ? new Date(r.pagado_hasta).toLocaleDateString("es-DO", { day: "numeric", month: "long", year: "numeric" }) : "—"}. Sus verificadores vuelven a dar precios en su próxima revisión.`, d);
}

export async function extenderPrueba(d: FormData) {
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("plataforma_extender_prueba", { p_negocio: campo(d, "negocio"), p_dias: Number(campo(d, "dias")) });
  volver(error, `Listo: ${campo(d, "dias")} días más de prueba.`, d);
}

/** Consulta desde el celular: servicio adicional que la Plataforma activa o quita (al quitarlo se apaga). */
export async function cambiarMovil(d: FormData) {
  const supabase = await supabaseServidor();
  const activa = campo(d, "activa") === "si";
  const { error } = await supabase.rpc("plataforma_movil", { p_negocio: campo(d, "negocio"), p_activa: activa });
  volver(error, activa ? "Consulta desde el celular contratada: el negocio ya puede activarla en Sucursales." : "Consulta desde el celular quitada y apagada.", d);
}

export async function suspender(d: FormData) {
  const supabase = await supabaseServidor();
  const negocio = campo(d, "negocio");
  if (campo(d, "accion") === "suspender") {
    const { error } = await supabase.rpc("plataforma_cambiar_plan", { p_negocio: negocio, p_plan: "suspendido" });
    volver(error, "Negocio suspendido: sus verificadores dejan de mostrar precios en su próxima revisión.", d);
  }
  // Quitar la suspensión: vuelve al plan que tenía (si su pago sigue vigente) o a la prueba.
  const { data: plan, error } = await supabase.rpc("plataforma_reactivar", { p_negocio: negocio });
  volver(error, plan === "prueba"
    ? "Suspensión quitada. Volvió a su prueba: si ya venció, sigue bloqueado hasta que registres un pago o le des días de prueba."
    : "Suspensión quitada: vuelve a funcionar con su plan pagado.", d);
}

/** Borra todos los archivos de una carpeta del bucket «marcas» (logo, ofertas, QR del negocio). */
async function vaciarCarpeta(admin: SupabaseClient, carpeta: string, nivel = 0): Promise<void> {
  if (nivel > 4) return;
  const { data } = await admin.storage.from("marcas").list(carpeta, { limit: 1000 });
  const archivos: string[] = [];
  for (const x of data ?? []) {
    if (x.id) archivos.push(`${carpeta}/${x.name}`);
    else await vaciarCarpeta(admin, `${carpeta}/${x.name}`, nivel + 1);
  }
  if (archivos.length) await admin.storage.from("marcas").remove(archivos);
}

/**
 * Elimina un negocio y todo lo suyo (solo administrador, confirmando con el nombre).
 * La base borra en cascada y deja constancia; aquí se limpian archivos, subdominio y cuentas «usuario» huérfanas.
 */
export async function eliminarNegocio(d: FormData) {
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.rpc("plataforma_eliminar_negocio", { p_negocio: campo(d, "negocio"), p_confirmacion: campo(d, "confirmacion") });
  if (error) volver(error, "", d);
  const r = data as { id: string; slug: string; nombre: string; cuentas: string[] };
  const pendientes: string[] = [];
  if (!problemaClaveSecreta()) {
    const admin = supabaseAdmin();
    try { await vaciarCarpeta(admin, r.id); } catch { pendientes.push("archivos"); }
    for (const id of r.cuentas ?? []) {
      const { error: e } = await admin.auth.admin.deleteUser(id);
      if (e) pendientes.push("cuentas de usuario");
    }
  } else if ((r.cuentas ?? []).length) pendientes.push("cuentas de usuario");
  const base = dominioBase(sitio());
  if (base && r.slug) {
    const e = await quitarSubdominio(`${r.slug}.${base}`);
    if (e) pendientes.push("enlace propio en Vercel");
  }
  volver(null, `«${r.nombre}» eliminado con todos sus datos.${pendientes.length ? ` No se pudo limpiar: ${[...new Set(pendientes)].join(", ")}.` : ""}`, d);
}

// ---------------------------------------------------------------- solicitudes
export async function atenderSolicitud(d: FormData) {
  const supabase = await supabaseServidor();
  const accion = campo(d, "accion");
  const { error } = await supabase.rpc("plataforma_atender_solicitud", {
    p_id: campo(d, "solicitud"), p_accion: accion, p_meses: Number(campo(d, "meses")) || null, p_respuesta: campo(d, "respuesta") || null,
  });
  volver(error, accion === "aprobar" ? "Solicitud aprobada: el plan quedó activo y el pago registrado."
    : accion === "rechazar" ? "Solicitud rechazada: el negocio ve el motivo en su pantalla de Licencia." : "Marcada como contactada.", d);
}

// ---------------------------------------------------------------- planes y reglas (solo administradores)
const numero = (d: FormData, n: string) => (campo(d, n) === "" ? "" : String(Number(campo(d, n))));
export async function guardarPlan(d: FormData) {
  const supabase = await supabaseServidor();
  const plan = {
    codigo: campo(d, "codigo").toLowerCase(), nombre: campo(d, "nombre"), descripcion: campo(d, "descripcion"),
    precio: campo(d, "precio").replace(",", "."), periodo: campo(d, "periodo") || "mensual", permanente: d.get("permanente") === "on",
    max_sucursales: numero(d, "max_sucursales"), max_equipos: numero(d, "max_equipos"), max_usuarios: numero(d, "max_usuarios"), max_pcs: numero(d, "max_pcs"),
    funciones: campo(d, "funciones").split("\n").map((x) => x.trim()).filter(Boolean),
    destacado: d.get("destacado") === "on", etiqueta: campo(d, "etiqueta"), activo: d.get("activo") === "on", orden: numero(d, "orden"),
  };
  const { error } = await supabase.rpc("plataforma_guardar_plan", { p: plan });
  volver(error, `Plan «${plan.nombre}» guardado.`, d);
}

export async function borrarPlan(d: FormData) {
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.rpc("plataforma_borrar_plan", { p_codigo: campo(d, "codigo") });
  volver(error, data === "borrado" ? "Plan borrado." : "Ese plan lo usa algún negocio: quedó desactivado (ya no se ofrece, pero sus negocios lo conservan).", d);
}

export async function guardarAjustes(d: FormData) {
  const supabase = await supabaseServidor();
  const claves = ["contacto_nombre", "contacto_telefono", "contacto_whatsapp", "contacto_correo", "contacto_horario", "moneda",
    "dias_prueba", "dias_aviso", "dias_gracia", "plazo_horas", "descuento_anual", "prueba_sucursales", "prueba_equipos", "prueba_usuarios", "prueba_pcs"];
  const p = Object.fromEntries(claves.map((k) => [k, campo(d, k)]));
  const { error } = await supabase.rpc("plataforma_guardar_ajustes", { p });
  volver(error, "Reglas guardadas. Los negocios ven el contacto en su pantalla de Licencia.", d);
}

// ---------------------------------------------------------------- PCs, historial y equipo de la plataforma
export async function liberarPc(d: FormData) {
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("plataforma_liberar_pc", { p_pc: campo(d, "pc") });
  volver(error, "PC liberada: la licencia ya se puede activar en otra PC. Si la abren en esa, les pedirá activarla de nuevo.", d);
}

/** Para la tarjeta del negocio: historial, pagos y PCs (se carga al abrirla). */
export async function historialNegocio(negocio: string) {
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.rpc("plataforma_historial", { p_negocio: negocio });
  if (error) return { error: mensajeError(error) };
  return data as { eventos: { tipo: string; detalle: Record<string, unknown>; creado: string; quien: string | null }[];
    pcs: { id: string; nombre: string | null; version: string | null; activada: string; visto: string; liberada: string | null }[];
    pagos: { plan: string; meses: number; hasta: string; nota: string | null; monto: number | null; creado: string }[] };
}

export async function ponerUsuario(d: FormData) {
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("plataforma_poner_usuario", { p_correo: campo(d, "correo").toLowerCase(), p_rol: campo(d, "rol") });
  volver(error, `Listo: ${campo(d, "correo")} entra a /plataforma como ${campo(d, "rol")}.`, d);
}

export async function quitarUsuario(d: FormData) {
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("plataforma_quitar_usuario", { p_usuario: campo(d, "usuario") });
  volver(error, "Quitado del equipo de la plataforma.", d);
}

/** Registra (otra vez) el enlace corto de un negocio en Vercel: para los negocios creados antes de activarlo. */
export async function activarEnlace(d: FormData) {
  await soloPlataforma();
  const corto = enlaceNegocio(sitio(), campo(d, "slug"));
  if (!vercelListo() || corto.includes("/n/")) volver("Los enlaces cortos no están activos (faltan VERCEL_TOKEN y VERCEL_PROJECT_ID en Vercel).", "", d);
  const error = await agregarSubdominio(corto.slice(8));
  volver(error ? `No se pudo activar ${corto}: ${error}` : null, `Enlace activo: ${corto} (el certificado tarda unos minutos).`, d);
}
