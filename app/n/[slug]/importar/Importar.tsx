"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/browser";
import { enviarEnPartes } from "@/lib/fuentes";
import { ejecutarPlan, leerRespaldo, type Destino, type FuentePlan, type Plan, type Resultado } from "@/lib/importar";
import { mensajeError } from "@/lib/util";

type Props = { negocioId: string; slug: string };

/** Destino real: Supabase con la sesión del usuario (la base decide qué puede hacer: dueño o admin). */
function destinoSupabase(negocioId: string): Destino {
  const sb = supabaseNavegador();
  const fallo = (e: { message?: string } | null) => { if (e) throw new Error(mensajeError(e)); };
  return {
    async inventarios() {
      const { data, error } = await sb.from("inventarios").select("id, nombre").eq("negocio_id", negocioId);
      fallo(error); return (data ?? []) as { id: string; nombre: string }[];
    },
    async crearInventario(nombre, origen) {
      const { data, error } = await sb.from("inventarios").insert({ negocio_id: negocioId, nombre, origen: origen ?? {} }).select("id").single();
      fallo(error); return (data as { id: string }).id;
    },
    async cargarProductos(id, productos) {
      return enviarEnPartes(productos, async (lote, parte, fin) => {
        const { data, error } = await sb.rpc("cargar_inventario", { p_inventario: id, p_lote: lote, p_productos: parte, p_fin: fin });
        fallo(error); return Number(data) || 0;
      });
    },
    async sucursales() {
      const { data, error } = await sb.from("sucursales").select("id, codigo, es_principal").eq("negocio_id", negocioId);
      fallo(error); return (data ?? []) as { id: string; codigo: string; es_principal: boolean }[];
    },
    async crearSucursal(s) {
      const { error } = await sb.from("sucursales").insert({
        negocio_id: negocioId, codigo: s.codigo, nombre: s.nombre, activa: s.activa, fuente: s.fuente,
        ...(s.geo ? { geo_activa: s.geo.activa, latitud: s.geo.latitud, longitud: s.geo.longitud, radio_m: s.geo.radio_m } : {}),
      });
      fallo(error);
    },
    async cambiarSucursal(id, s) {
      const cambios: Record<string, unknown> = {};
      if (s.nombre !== undefined) cambios.nombre = s.nombre;
      if (s.activa !== undefined) cambios.activa = s.activa;
      if (s.fuente !== undefined) cambios.fuente = s.fuente;
      if (s.geo) Object.assign(cambios, { geo_activa: s.geo.activa, latitud: s.geo.latitud, longitud: s.geo.longitud, radio_m: s.geo.radio_m });
      if (!Object.keys(cambios).length) return;
      const { error } = await sb.from("sucursales").update(cambios).eq("id", id);
      fallo(error);
    },
    async apariencia() {
      const { data, error } = await sb.from("negocios").select("apariencia").eq("id", negocioId).single();
      fallo(error); return ((data as { apariencia: Record<string, unknown> } | null)?.apariencia ?? {});
    },
    async guardarApariencia(apariencia, moneda) {
      const { error } = await sb.from("negocios").update({ apariencia, ...(moneda ? { moneda } : {}) }).eq("id", negocioId);
      fallo(error);
    },
    async subirImagen(cual, bytes, tipo) {
      const ruta = `${negocioId}/${cual}.${tipo.split("/")[1].replace("svg+xml", "svg").replace("jpeg", "jpg")}`;
      const { error } = await sb.storage.from("marcas").upload(ruta, new Blob([bytes.slice()], { type: tipo }), { upsert: true, contentType: tipo, cacheControl: "60" });
      fallo(error);
      return sb.storage.from("marcas").getPublicUrl(ruta).data.publicUrl + `?v=${Date.now()}`;
    },
  };
}

const textoFuente = (f: FuentePlan) => (f.tipo === "inventario" ? f.nombre : "Igual que la Principal");
const n = (x: number) => x.toLocaleString("es-DO");

export function Importar({ negocioId, slug }: Props) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [estado, setEstado] = useState<{ tipo: "error" | "trabajando" | "bien"; texto: string; parte?: number } | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [destinoPrueba] = useState<Destino | null>(() =>
    (typeof window !== "undefined" && (window as unknown as { __destinoPrueba?: Destino }).__destinoPrueba) || null);
  const imagenes = useMemo(() => ({
    logo: plan?.logo ? URL.createObjectURL(new Blob([plan.logo.bytes.slice()], { type: plan.logo.tipo })) : null,
    qr: plan?.qr ? URL.createObjectURL(new Blob([plan.qr.bytes.slice()], { type: plan.qr.tipo })) : null,
  }), [plan]);
  useEffect(() => () => { if (imagenes.logo) URL.revokeObjectURL(imagenes.logo); if (imagenes.qr) URL.revokeObjectURL(imagenes.qr); }, [imagenes]);
  const trabajando = estado?.tipo === "trabajando";
  const totalProductos = plan?.inventarios.reduce((t, i) => t + i.productos.length, 0) ?? 0;

  async function elegir(f: File | undefined) {
    setPlan(null); setResultado(null); setEstado(null);
    if (!f) return;
    try {
      setEstado({ tipo: "trabajando", texto: "Leyendo el respaldo…" });
      setPlan(await leerRespaldo(new Uint8Array(await f.arrayBuffer())));
      setEstado(null);
    } catch (e) {
      setEstado({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo leer el respaldo." });
    }
  }

  async function importar() {
    if (!plan) return;
    try {
      const r = await ejecutarPlan(plan, destinoPrueba ?? destinoSupabase(negocioId),
        (texto, parte) => setEstado({ tipo: "trabajando", texto, parte }));
      setResultado(r);
      setEstado({ tipo: "bien", texto: "Importación terminada." });
    } catch (e) {
      setEstado({ tipo: "error", texto: `Se detuvo: ${e instanceof Error ? e.message : "error"}. Lo ya importado se queda; puedes volver a importar (no duplica).` });
    }
  }

  return (
    <>
      <section className="tarjeta">
        <h2>1. Elige el respaldo</h2>
        <p className="quieto" style={{ marginTop: 0 }}>
          En el sistema anterior: <strong>Administración › Respaldo › Descargar respaldo</strong> (un archivo .zip). Se lee aquí
          mismo: nada cambia hasta que toques «Importar».
        </p>
        <label className="zona-archivo">
          <input type="file" accept=".zip,application/zip" onChange={(e) => void elegir(e.target.files?.[0])} disabled={trabajando} />
          <span>Elegir respaldo (.zip)</span>
        </label>
      </section>

      {plan && !resultado && (
        <section className="tarjeta importar-plan" style={{ marginTop: 20 }} aria-labelledby="t-plan">
          <h2 id="t-plan">2. Revisa lo que se va a importar</h2>
          {plan.creado && <p className="quieto" style={{ marginTop: 0 }}>Respaldo del {new Date(plan.creado).toLocaleString("es-DO", { dateStyle: "long", timeStyle: "short" })}.</p>}

          <h3>Inventarios · {n(plan.inventarios.length)} con {n(totalProductos)} productos</h3>
          <ul className="lista">
            {plan.inventarios.map((i) => (
              <li key={i.nombre}>
                <span>{i.nombre}{i.nota && <span className="quieto pequeno"> · {i.nota}</span>}</span>
                <span className="quieto">{i.origen ? <span className="origen google">Google</span> : `${n(i.productos.length)} productos`}</span>
              </li>
            ))}
          </ul>

          <h3>Sucursales</h3>
          <ul className="lista">
            <li>
              <span><strong>{plan.principal.nombre ?? "Principal"}</strong> <span className="quieto pequeno">· Principal{plan.principal.geo ? " · con ubicación" : ""}</span></span>
              <span className="quieto">{plan.principal.fuente.tipo === "inventario" ? plan.principal.fuente.nombre : "— sin inventario —"}</span>
            </li>
            {plan.sucursales.map((s) => (
              <li key={s.codigo}>
                <span>{s.nombre} <span className="quieto pequeno">· {s.codigo}{s.geo ? " · con ubicación" : ""}{s.activa ? "" : " · inactiva"}</span></span>
                <span className="quieto">{textoFuente(s.fuente)}</span>
              </li>
            ))}
          </ul>

          <h3>Apariencia</h3>
          <div className="importar-marca">
            {imagenes.logo ? <img src={imagenes.logo} alt="Logo" /> : <span className="quieto pequeno">Sin logo</span>}
            {imagenes.qr ? <img src={imagenes.qr} alt="QR" /> : <span className="quieto pequeno">Sin QR</span>}
            <span className="quieto pequeno">
              {plan.apariencia ? <>Estilo «{String(plan.apariencia.estilo ?? "claro")}»{typeof plan.apariencia.color_marca === "string" &&
                <> · color <span className="muestra-color" style={{ background: plan.apariencia.color_marca }} /> {plan.apariencia.color_marca}</>}</> : "Sin apariencia guardada"}
              {plan.moneda && ` · moneda ${plan.moneda}`}
            </span>
          </div>

          {plan.avisos.length > 0 && (
            <div className="aviso" style={{ background: "#fffbea", color: "#7a5b00", marginTop: 16 }}>
              <strong>Para revisar después</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: "1.2em" }}>{plan.avisos.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
          )}
          <p className="quieto pequeno">
            No se importan los usuarios (cada persona crea su cuenta y la invitas en Resumen › Equipo) ni los equipos (se
            vinculan de nuevo en Equipos). Si un inventario o una sucursal ya existe con el mismo nombre o código, se actualiza.
          </p>
          <button className="boton" type="button" onClick={importar} disabled={trabajando}>Importar a Prezio</button>
        </section>
      )}

      {estado && (
        <div className={estado.tipo === "error" ? "aviso error" : estado.tipo === "bien" ? "aviso bien" : "aviso"} role={estado.tipo === "error" ? "alert" : "status"} style={{ marginTop: 20 }}>
          {estado.texto}
          {estado.tipo === "trabajando" && estado.parte !== undefined && (
            <div className="progreso" style={{ marginTop: 8 }}><span style={{ width: `${Math.round(estado.parte * 100)}%` }} /></div>
          )}
        </div>
      )}

      {resultado && (
        <section className="tarjeta" style={{ marginTop: 20 }}>
          <h2>3. Listo</h2>
          <ul className="lista">
            <li><span>Inventarios</span><span>{n(resultado.inventarios)} · {n(resultado.productos)} productos</span></li>
            <li><span>Sucursales</span><span>{n(resultado.sucursalesNuevas)} nuevas · {n(resultado.sucursalesActualizadas)} actualizadas</span></li>
            <li><span>Apariencia, logo y QR</span><span>{resultado.marca ? "importados" : "—"}</span></li>
          </ul>
          <p style={{ marginBottom: 0 }}>
            Sigue: revisa <a href={`/n/${slug}`}>Resumen</a>, <a href={`/n/${slug}/apariencia`}>Apariencia</a> y vincula los equipos en <a href={`/n/${slug}/equipos`}>Equipos</a>.
          </p>
        </section>
      )}
    </>
  );
}
