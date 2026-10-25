/** Importar un negocio desde el respaldo del sistema anterior («Consulta de Precios»): el ZIP que crea
 *  Administración › Respaldo (manifest.json + tablas/*.json + archivos/*).
 *
 *  1. leerRespaldo(): abre el ZIP en el navegador y arma un PLAN (no toca nada) para mostrarlo antes.
 *  2. ejecutarPlan(): crea o actualiza en Prezio, en este orden: inventarios con sus productos, Principal,
 *     sucursales con su fuente, apariencia, logo y QR. Se puede repetir: empareja por nombre y por código.
 *
 *  Lo que no se puede traer tal cual se convierte:
 *  - Google (con cuenta de Google) → inventario «desde Google» con el mismo archivo y columnas (hay que compartir
 *    la hoja con «Cualquier persona con el enlace»).
 *  - SQL Server → se avisa: se crea un conector nuevo en Prezio (su clave anterior no sirve aquí).
 *  - Precios propios de una sucursal (versión anterior, encima de la Principal) → un inventario con los precios
 *    de la Principal + los suyos, que es lo que veía esa sucursal. */

import { Zip } from "@/lib/zip";
import type { Producto } from "@/lib/hoja";
import type { ColumnasGuardadas, OrigenGoogle } from "@/lib/fuentes";

export type Geo = { activa: boolean; latitud: number; longitud: number; radio_m: number };
export type FuentePlan =
  | { tipo: "principal" }
  | { tipo: "inventario"; nombre: string };

export type InventarioPlan = { nombre: string; productos: Producto[]; origen?: OrigenGoogle; nota?: string };
export type SucursalPlan = { codigo: string; nombre: string; activa: boolean; geo: Geo | null; fuente: FuentePlan };

export type Plan = {
  creado: string | null;
  inventarios: InventarioPlan[];
  principal: { nombre: string | null; fuente: FuentePlan; geo: Geo | null };
  sucursales: SucursalPlan[];
  apariencia: Record<string, unknown> | null;
  moneda: string | null;
  logo: { bytes: Uint8Array; tipo: string } | null;
  qr: { bytes: Uint8Array; tipo: string } | null;
  avisos: string[];
};

type Fila = Record<string, unknown>;
const texto = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const numero = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

function productosDe(filas: Fila[]): Producto[] {
  const porCodigo = new Map<string, Producto>();
  for (const f of filas) {
    const codigo = texto(f.barcode).slice(0, 64), nombre = texto(f.name).slice(0, 200), precio = numero(f.price);
    if (codigo && nombre && precio !== null && precio >= 0) porCodigo.set(codigo, { codigo, nombre, precio: Math.round(precio * 100) / 100 });
  }
  return [...porCodigo.values()];
}

function geoDe(activa: unknown, lat: unknown, lon: unknown, radio: unknown): Geo | null {
  const la = numero(lat), lo = numero(lon);
  if (la === null || lo === null || (la === 0 && lo === 0) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  return { activa: activa !== false, latitud: la, longitud: lo, radio_m: Math.min(10000, Math.max(10, Math.round(numero(radio) ?? 100))) };
}

function origenGoogle(g: Fila | null | undefined): OrigenGoogle | null {
  if (!g) return null;
  const id = texto(g.file_id);
  const columnas: ColumnasGuardadas = { codigo: texto(g.code_column), nombre: texto(g.name_column), precio: texto(g.price_column) };
  if (!/^[\w-]{20,}$/.test(id) || !columnas.codigo || !columnas.nombre || !columnas.precio) return null;
  const url = texto(g.kind) === "sheets"
    ? `https://docs.google.com/spreadsheets/d/${id}/edit`
    : `https://drive.google.com/file/d/${id}/view`;
  return { tipo: "google", url, columnas, cada_min: 60 };
}

function codigoValido(c: string): string {
  const limpio = c.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
  return limpio.length >= 2 ? limpio : `sucursal-${limpio || "1"}`;
}

const TIPOS_IMAGEN: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" };

export async function leerRespaldo(datos: Uint8Array): Promise<Plan> {
  let zip: Zip;
  try { zip = new Zip(datos); } catch { throw new Error("Ese archivo no es un ZIP. Elige el respaldo (.zip) que descargaste del sistema anterior."); }
  if (!zip.tiene("manifest.json")) throw new Error("Este ZIP no es un respaldo del sistema anterior (le falta manifest.json).");
  const manifest = JSON.parse(await zip.texto("manifest.json")) as { formato?: number; creado?: string };
  if (manifest.formato !== 1) throw new Error("Formato de respaldo desconocido. Descarga uno nuevo desde el sistema anterior.");
  const tabla = async (n: string): Promise<Fila[]> => {
    const t = await zip.texto(`tablas/${n}.json`);
    try { const v = t ? JSON.parse(t) : []; return Array.isArray(v) ? v as Fila[] : []; } catch { return []; }
  };
  const [invs, items, sucs, propios, fuenteP, geoP, googleP, externas] = await Promise.all([
    tabla("price_inventories"), tabla("price_inventory_items"), tabla("sucursales"), tabla("sucursal_precios"),
    tabla("price_source_settings"), tabla("mobile_geo_settings"), tabla("google_price_source"), tabla("external_price_sources"),
  ]);
  const avisos: string[] = [];

  // ---------------------------------------------------------------- inventarios
  const itemsPorInv = new Map<string, Fila[]>();
  for (const it of items) {
    const k = texto(it.inventory_id);
    if (!itemsPorInv.has(k)) itemsPorInv.set(k, []);
    itemsPorInv.get(k)!.push(it);
  }
  const nombrePorId = new Map<string, string>();
  const inventarios: InventarioPlan[] = [];
  const usados = new Set<string>();
  const nombreLibre = (base: string) => {
    let n = base.slice(0, 80), i = 2;
    while (usados.has(n.toLowerCase())) n = `${base.slice(0, 74)} (${i++})`;
    usados.add(n.toLowerCase());
    return n;
  };
  for (const inv of invs) {
    const nombre = nombreLibre(texto(inv.name) || `Inventario ${texto(inv.id)}`);
    nombrePorId.set(texto(inv.id), nombre);
    inventarios.push({ nombre, productos: productosDe(itemsPorInv.get(texto(inv.id)) ?? []) });
  }
  const activo = invs.find((i) => i.is_active === true);

  // ---------------------------------------------------------------- Principal
  const apariencia = await (async () => {
    const t = await zip.texto("archivos/apariencia.json");
    try { return t ? JSON.parse(t) as Record<string, unknown> : null; } catch { return null; }
  })();
  const tipoP = texto(fuenteP[0]?.source_type) || "local";
  let fuentePrincipal: FuentePlan = { tipo: "principal" };
  let productosPrincipal: Producto[] = [];
  if (tipoP === "local") {
    if (activo) {
      fuentePrincipal = { tipo: "inventario", nombre: nombrePorId.get(texto(activo.id))! };
      productosPrincipal = inventarios.find((i) => i.nombre === nombrePorId.get(texto(activo.id)))?.productos ?? [];
    } else if (invs.length) avisos.push("La Principal no tenía un inventario activo: elígelo en Resumen › Sucursales.");
  } else if (tipoP === "google") {
    const o = origenGoogle(googleP[0]);
    if (o) {
      const nombre = nombreLibre("Google · Principal");
      inventarios.push({ nombre, productos: [], origen: o, nota: "Se llena solo desde Google en unos minutos" });
      fuentePrincipal = { tipo: "inventario", nombre };
      avisos.push("La Principal tomaba los precios de Google. En Google abre ese archivo › Compartir › «Cualquier persona con el enlace» · Lector; si no, Prezio no lo puede leer.");
    } else avisos.push("La Principal usaba Google pero el respaldo no trae el archivo completo: créalo en Inventarios › Inventario desde Google.");
  } else if (tipoP === "external") {
    avisos.push(`La Principal tomaba los precios de SQL Server${externas.length ? ` (${externas.length} configuración)` : ""}: crea un conector en Inventarios › Conector de SQL Server e instálalo en la PC del sistema.`);
  }

  // ---------------------------------------------------------------- sucursales
  const propiosPor = new Map<string, Fila[]>();
  for (const p of propios) {
    const k = texto(p.sucursal_id);
    if (!propiosPor.has(k)) propiosPor.set(k, []);
    propiosPor.get(k)!.push(p);
  }
  const codigos = new Set<string>(["principal"]);
  const sucursales: SucursalPlan[] = [];
  for (const s of sucs) {
    const nombre = texto(s.nombre).slice(0, 80) || "Sucursal";
    let codigo = codigoValido(texto(s.codigo) || nombre);
    for (let i = 2; codigos.has(codigo); i++) codigo = codigoValido(`${codigo.slice(0, 26)}-${i}`);
    codigos.add(codigo);
    const cfg = (s.excepciones_config && typeof s.excepciones_config === "object" ? s.excepciones_config : {}) as Fila;
    const tipo = texto(cfg.fuente);
    let fuente: FuentePlan = { tipo: "principal" };
    if (tipo === "inventario" && nombrePorId.has(texto(cfg.inventario_id))) {
      fuente = { tipo: "inventario", nombre: nombrePorId.get(texto(cfg.inventario_id))! };
    } else if (tipo === "google") {
      const o = origenGoogle(cfg.google as Fila);
      if (o) {
        const n = nombreLibre(`Google · ${nombre}`);
        inventarios.push({ nombre: n, productos: [], origen: o, nota: "Se llena solo desde Google en unos minutos" });
        fuente = { tipo: "inventario", nombre: n };
        avisos.push(`«${nombre}» tomaba sus precios de Google: comparte ese archivo con «Cualquier persona con el enlace».`);
      } else avisos.push(`«${nombre}» usaba Google sin archivo completo: queda igual que la Principal.`);
    } else if (tipo === "external") {
      avisos.push(`«${nombre}» tomaba sus precios de SQL Server: queda igual que la Principal hasta que instales un conector de Prezio.`);
    } else if ((propiosPor.get(texto(s.id)) ?? []).length) {
      // Versión anterior: precios propios por encima de los de la Principal.
      const mezcla = new Map(productosPrincipal.map((p) => [p.codigo, p]));
      for (const p of productosDe(propiosPor.get(texto(s.id))!.map((x) => ({ ...x, name: texto(x.name) || mezcla.get(texto(x.barcode))?.nombre || texto(x.barcode) })))) {
        mezcla.set(p.codigo, p);
      }
      const n = nombreLibre(`Precios · ${nombre}`);
      inventarios.push({ nombre: n, productos: [...mezcla.values()], nota: `Principal + ${propiosPor.get(texto(s.id))!.length} precios propios` });
      fuente = { tipo: "inventario", nombre: n };
    }
    sucursales.push({ codigo, nombre, activa: s.activa !== false, geo: geoDe(s.geo_enabled, s.latitude, s.longitude, s.radius_m), fuente });
  }

  // ---------------------------------------------------------------- apariencia, logo y QR
  const imagen = async (bases: string[]) => {
    for (const b of bases) for (const ext of Object.keys(TIPOS_IMAGEN)) {
      const bytes = await zip.bytes(`archivos/${b}.${ext}`);
      if (bytes && bytes.byteLength && bytes.byteLength <= 2 * 1024 * 1024) return { bytes, tipo: TIPOS_IMAGEN[ext] };
    }
    return null;
  };
  const [logo, qr] = await Promise.all([imagen(["logo"]), imagen(["qr-movil", "qr"])]);
  const moneda = apariencia && typeof apariencia.moneda === "string" && apariencia.moneda.trim() ? apariencia.moneda.trim().slice(0, 6) : null;
  const g = geoP[0];
  return {
    creado: manifest.creado ?? null,
    inventarios,
    principal: {
      nombre: apariencia && typeof apariencia.nombre_principal === "string" && apariencia.nombre_principal.trim() ? apariencia.nombre_principal.trim().slice(0, 80) : null,
      fuente: fuentePrincipal,
      geo: g ? geoDe(g.enabled, g.latitude, g.longitude, g.radius_m) : null,
    },
    sucursales,
    apariencia,
    moneda,
    logo,
    qr,
    avisos,
  };
}

// ---------------------------------------------------------------- ejecutar
/** Lo que necesita la importación de Prezio (en la app: Supabase con la sesión del usuario). */
export type Destino = {
  inventarios(): Promise<{ id: string; nombre: string }[]>;
  crearInventario(nombre: string, origen?: OrigenGoogle): Promise<string>;
  cargarProductos(inventario: string, productos: Producto[]): Promise<number>;
  sucursales(): Promise<{ id: string; codigo: string; es_principal: boolean }[]>;
  crearSucursal(datos: { codigo: string; nombre: string; activa: boolean; geo: Geo | null; fuente: Record<string, unknown> }): Promise<void>;
  cambiarSucursal(id: string, datos: { nombre?: string; activa?: boolean; geo?: Geo | null; fuente?: Record<string, unknown> }): Promise<void>;
  apariencia(): Promise<Record<string, unknown>>;
  guardarApariencia(apariencia: Record<string, unknown>, moneda: string | null): Promise<void>;
  subirImagen(cual: "logo" | "qr", bytes: Uint8Array, tipo: string): Promise<string>;
};

export type Resultado = { inventarios: number; productos: number; sucursalesNuevas: number; sucursalesActualizadas: number; marca: boolean };

const CLAVES_APARIENCIA = ["estilo", "color_marca", "posicion_logo", "mostrar_nombre", "mostrar_sucursal", "mostrar_logo", "mostrar_qr",
  "titulo_espera", "mensaje_espera", "texto_qr"];

export async function ejecutarPlan(plan: Plan, d: Destino, avance: (texto: string, parte: number) => void = () => {}): Promise<Resultado> {
  const r: Resultado = { inventarios: 0, productos: 0, sucursalesNuevas: 0, sucursalesActualizadas: 0, marca: false };
  const pasos = plan.inventarios.length + 3;
  let paso = 0;
  const idPorNombre = new Map((await d.inventarios()).map((i) => [i.nombre.toLowerCase(), i.id]));

  for (const inv of plan.inventarios) {
    avance(`Inventario «${inv.nombre}»${inv.productos.length ? `: ${inv.productos.length.toLocaleString("es-DO")} productos` : ""}…`, paso++ / pasos);
    let id = idPorNombre.get(inv.nombre.toLowerCase());
    if (!id) {
      id = await d.crearInventario(inv.nombre, inv.origen);
      idPorNombre.set(inv.nombre.toLowerCase(), id);
    }
    if (inv.productos.length) r.productos += await d.cargarProductos(id, inv.productos);
    r.inventarios++;
  }
  const fuente = (f: FuentePlan) => f.tipo === "inventario" && idPorNombre.has(f.nombre.toLowerCase())
    ? { tipo: "inventario", inventario_id: idPorNombre.get(f.nombre.toLowerCase())! } : {};

  avance("Principal y sucursales…", paso++ / pasos);
  const existentes = await d.sucursales();
  const principal = existentes.find((s) => s.es_principal);
  if (principal) {
    await d.cambiarSucursal(principal.id, {
      ...(plan.principal.nombre ? { nombre: plan.principal.nombre } : {}),
      ...(plan.principal.fuente.tipo === "inventario" ? { fuente: fuente(plan.principal.fuente) } : {}),
      ...(plan.principal.geo ? { geo: plan.principal.geo } : {}),
    });
  }
  for (const s of plan.sucursales) {
    const ya = existentes.find((x) => x.codigo === s.codigo && !x.es_principal);
    if (ya) {
      await d.cambiarSucursal(ya.id, { nombre: s.nombre, activa: s.activa, geo: s.geo, fuente: fuente(s.fuente) });
      r.sucursalesActualizadas++;
    } else {
      await d.crearSucursal({ codigo: s.codigo, nombre: s.nombre, activa: s.activa, geo: s.geo, fuente: fuente(s.fuente) });
      r.sucursalesNuevas++;
    }
  }

  avance("Apariencia, logo y QR…", paso++ / pasos);
  if (plan.apariencia || plan.logo || plan.qr || plan.moneda) {
    const actual = await d.apariencia();
    const nueva: Record<string, unknown> = { ...actual };
    for (const k of CLAVES_APARIENCIA) if (plan.apariencia && k in plan.apariencia) nueva[k] = plan.apariencia[k];
    if (plan.logo) nueva.logo = await d.subirImagen("logo", plan.logo.bytes, plan.logo.tipo);
    if (plan.qr) nueva.qr = await d.subirImagen("qr", plan.qr.bytes, plan.qr.tipo);
    await d.guardarApariencia(nueva, plan.moneda);
    r.marca = true;
  }
  avance("Listo", 1);
  return r;
}
