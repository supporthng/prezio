"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pantalla, type EstadoPantalla } from "@/components/Pantalla";
import { normalizar } from "@/lib/apariencia";
import { variantes } from "@/lib/codigos";
import {
  APP_EQUIPO, ErrorEquipo, anotar, borrar, claveNueva, contarPendientes, guardar, leer, llamar,
  lotePendientes, quitarPendientes, type Catalogo, type InfoEquipo,
} from "@/lib/equipo";

type Fase = "cargando" | "vincular" | "listo";
type Codigo = { codigo: string; expira: string };
type Producto = { nombre: string; precio: number };

const CADA_MIN = 5;              // revisar precios y subir consultas
const CADA_VINCULO_S = 4;        // mientras espera que lo vinculen
const SEG_NO_ENCONTRADO = 6;

/** Verificador sin internet: guarda los precios de su sucursal y consulta en el equipo. */
export function Equipo({ sitio }: { sitio: string }) {
  const [fase, setFase] = useState<Fase>("cargando");
  const [info, setInfo] = useState<InfoEquipo | null>(null);
  const [codigo, setCodigo] = useState<Codigo | null>(null);
  const [estado, setEstado] = useState<EstadoPantalla>({ tipo: "espera" });
  const [enLinea, setEnLinea] = useState(true);
  const [aviso, setAviso] = useState("");
  const [menu, setMenu] = useState<null | { productos: number; pendientes: number; sincronizado: string | null }>(null);

  const clave = useRef("");
  const productos = useRef(new Map<string, Producto>());
  const version = useRef<string | null>(null);
  const faseRef = useRef<Fase>("cargando");
  const ocupado = useRef(false);
  const entrada = useRef<HTMLInputElement>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vez = useRef(0);
  const dialogo = useRef<HTMLDialogElement>(null);

  const cambiarFase = (f: Fase) => { faseRef.current = f; setFase(f); };

  const cargarCatalogo = (c: Catalogo) => {
    const m = new Map<string, Producto>();
    for (const [cod, nombre, precio] of c.productos) m.set(String(cod), { nombre, precio: Number(precio) || 0 });
    productos.current = m;
    version.current = c.version;
  };

  const olvidar = useCallback(async () => {
    await Promise.all([borrar("info"), borrar("catalogo"), borrar("sincronizado")]).catch(() => {});
    productos.current = new Map();
    version.current = null;
    setInfo(null);
    setCodigo(null);
    cambiarFase("vincular");
  }, []);

  const pedirCodigo = useCallback(async () => {
    try {
      const c = await llamar<Codigo>("solicitar_vinculo", { p_clave: clave.current });
      setCodigo(c);
      setAviso("");
    } catch (e) {
      setAviso(e instanceof ErrorEquipo && e.tipo === "red" ? "Sin internet: conecta el equipo para vincularlo." : (e as Error).message);
    }
  }, []);

  /** Habla con Prezio: estado, precios nuevos si cambiaron, y sube las consultas hechas sin internet. */
  const sincronizar = useCallback(async () => {
    if (ocupado.current || !clave.current) return;
    ocupado.current = true;
    try {
      const pendientes = await contarPendientes().catch(() => 0);
      const nuevo = await llamar<InfoEquipo>("equipo_estado", {
        p_clave: clave.current, p_app: APP_EQUIPO, p_productos: productos.current.size,
        p_pendientes: pendientes, p_version: version.current,
      });
      setEnLinea(true);
      if (nuevo.version !== version.current || !productos.current.size) {
        const cat = await llamar<Catalogo>("equipo_catalogo", { p_clave: clave.current }, 120000);
        await guardar("catalogo", cat);
        cargarCatalogo(cat);
      }
      await guardar("info", nuevo);
      await guardar("sincronizado", new Date().toISOString());
      setInfo(nuevo);
      setCodigo(null);
      cambiarFase("listo");
      // Consultas por subir, de 500 en 500.
      for (let i = 0; i < 50; i++) {
        const { claves, filas } = await lotePendientes(500);
        if (!filas.length) break;
        await llamar<number>("equipo_anotar", { p_clave: clave.current, p_consultas: filas }, 60000);
        await quitarPendientes(claves);
      }
    } catch (e) {
      const tipo = e instanceof ErrorEquipo ? e.tipo : "otro";
      if (tipo === "red") setEnLinea(false);
      else if (tipo === "no_valido") {
        // Lo quitaron en el panel (o nunca se vinculó): vuelve a pedir código.
        setEnLinea(true);
        if (faseRef.current !== "vincular") await olvidar();
        await pedirCodigo();
      } else if (tipo === "pendiente") {
        setEnLinea(true);
      }
    } finally {
      ocupado.current = false;
    }
  }, [olvidar, pedirCodigo]);

  // Arranque: lo guardado primero (funciona sin internet), luego Prezio.
  useEffect(() => {
    let vivo = true;
    (async () => {
      let c = await leer<string>("clave").catch(() => undefined);
      if (!c) { c = claveNueva(); await guardar("clave", c).catch(() => {}); }
      clave.current = c;
      const [i, cat] = await Promise.all([leer<InfoEquipo>("info"), leer<Catalogo>("catalogo")]).catch(() => [undefined, undefined]);
      if (!vivo) return;
      if (i && cat) { cargarCatalogo(cat); setInfo(i); cambiarFase("listo"); }
      else cambiarFase("vincular");
      await sincronizar();
    })();
    return () => { vivo = false; };
  }, [sincronizar]);

  // Repetir: cada pocos segundos mientras espera el vínculo; cada pocos minutos ya funcionando.
  useEffect(() => {
    const ms = fase === "vincular" ? CADA_VINCULO_S * 1000 : CADA_MIN * 60000;
    const t = setInterval(() => { void sincronizar(); }, ms);
    const alVolver = () => { void sincronizar(); };
    window.addEventListener("online", alVolver);
    return () => { clearInterval(t); window.removeEventListener("online", alVolver); };
  }, [fase, sincronizar]);

  // El código vence a los 15 minutos: se pide otro solo.
  useEffect(() => {
    if (fase !== "vincular" || !codigo) return;
    const falta = Date.parse(codigo.expira) - Date.now() - 5000;
    const t = setTimeout(() => { void pedirCodigo(); }, Math.max(1000, falta));
    return () => clearTimeout(t);
  }, [fase, codigo, pedirCodigo]);

  // Funciona sin internet la próxima vez: registra el guardián de la página y le pasa lo que debe guardar.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/equipo" }).then(async () => {
      const listo = await navigator.serviceWorker.ready;
      const propios = performance.getEntriesByType("resource").map((r) => r.name)
        .filter((u) => u.startsWith(location.origin + "/_next/static/"));
      listo.active?.postMessage({ tipo: "guardar", urls: ["/equipo", "/manifest.webmanifest", ...propios] });
    }).catch(() => {});
  }, []);

  // ---------------------------------------------------------------- lector
  const enfocar = useCallback(() => {
    if (dialogo.current?.open) return;
    entrada.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const t = setInterval(() => { if (document.activeElement !== entrada.current) enfocar(); }, 700);
    return () => clearInterval(t);
  }, [enfocar]);

  const volverLuego = (segundos: number) => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setEstado({ tipo: "espera" }), segundos * 1000);
  };

  function consultar(leido: string) {
    const cod = leido.trim();
    if (!cod || cod.length > 64 || faseRef.current !== "listo") return;
    let hallado: { codigo: string; p: Producto } | null = null;
    for (const forma of variantes(cod)) {
      const p = productos.current.get(forma);
      if (p) { hallado = { codigo: forma, p }; break; }
    }
    const hora = new Date().toISOString();
    if (hallado) {
      vez.current += 1;
      setEstado({ tipo: "producto", codigo: hallado.codigo, nombre: hallado.p.nombre, precio: hallado.p.precio, vez: vez.current });
      volverLuego(apariencia.segundos);
      void anotar({ codigo: cod, encontrado: true, nombre: hallado.p.nombre, precio: hallado.p.precio, hora }).catch(() => {});
    } else {
      setEstado(version.current === "sin_fuente" ? { tipo: "sin_fuente", codigo: cod } : { tipo: "no", codigo: cod });
      volverLuego(SEG_NO_ENCONTRADO);
      void anotar({ codigo: cod, encontrado: false, hora }).catch(() => {});
    }
  }

  async function abrirMenu() {
    const [pendientes, sincronizado] = await Promise.all([
      contarPendientes().catch(() => 0), leer<string>("sincronizado").catch(() => undefined),
    ]);
    setMenu({ productos: productos.current.size, pendientes, sincronizado: sincronizado ?? null });
    dialogo.current?.showModal();
  }
  // El menú se cierra solo para que la pantalla no quede tapada.
  useEffect(() => {
    if (!menu) return;
    const t = setTimeout(() => dialogo.current?.close(), 60000);
    return () => clearTimeout(t);
  }, [menu]);

  const apariencia = normalizar(info?.negocio.apariencia ?? {});
  const formatoFecha = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" }) : "—");

  if (fase === "cargando") return <div className="equipo-vincular"><p className="quieto">Abriendo…</p></div>;

  if (fase === "vincular") {
    const c = codigo?.codigo;
    return (
      <div className="equipo-vincular">
        <div className="equipo-vincular-caja">
          <p className="equipo-marca">Prezio</p>
          <h1>Vincula este equipo</h1>
          <ol>
            <li>En otro teléfono o computadora entra a <strong>{sitio.replace(/^https?:\/\//, "")}</strong>.</li>
            <li>Abre tu negocio › <strong>Equipos</strong> › Vincular un equipo.</li>
            <li>Escribe este código y elige la sucursal:</li>
          </ol>
          <p className="equipo-codigo" aria-live="polite">{c ? `${c.slice(0, 4)} ${c.slice(4)}` : "· · · ·  · · · ·"}</p>
          <p className="quieto pequeno">
            {aviso || (c ? "El código cambia cada 15 minutos. Esta pantalla sigue sola al vincularlo." : "Pidiendo código…")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="verificador" onClick={enfocar}>
      <Pantalla apariencia={apariencia} moneda={info?.negocio.moneda ?? "RD$"} negocio={info?.negocio.nombre ?? ""}
        sucursal={info?.sucursal.nombre} estado={estado}>
        <input ref={entrada} className="pz-lector" aria-label="Código de barras" inputMode="none" autoComplete="off" autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const v = e.currentTarget.value;
              e.currentTarget.value = "";
              consultar(v);
            }
          }} />
      </Pantalla>
      <div className="verificador-esquina">
        <button type="button" title="Información del equipo" aria-label="Información del equipo"
          onClick={(e) => { e.stopPropagation(); void abrirMenu(); }}>
          {enLinea ? "ⓘ" : <span className="equipo-sin-red" aria-label="Sin internet">⚠</span>}
        </button>
      </div>
      <dialog ref={dialogo} className="equipo-menu" onClose={() => { setMenu(null); entrada.current?.focus({ preventScroll: true }); }}
        onClick={(e) => e.stopPropagation()}>
        {menu && info && (
          <>
            <h2>{info.equipo.nombre}</h2>
            <dl>
              <dt>Negocio</dt><dd>{info.negocio.nombre}</dd>
              <dt>Sucursal</dt><dd>{info.sucursal.nombre}</dd>
              <dt>Precios guardados</dt><dd>{menu.productos.toLocaleString("es-DO")}</dd>
              <dt>Internet</dt><dd>{enLinea ? "Conectado" : "Sin conexión: sigue funcionando con los precios guardados"}</dd>
              <dt>Última revisión</dt><dd>{formatoFecha(menu.sincronizado)}</dd>
              <dt>Consultas por subir</dt><dd>{menu.pendientes.toLocaleString("es-DO")}</dd>
            </dl>
            <div className="fila">
              <button className="boton" type="button" onClick={async () => { await sincronizar(); await abrirMenu(); }}>Buscar precios nuevos</button>
              <button className="boton secundario" type="button"
                onClick={() => { void document.documentElement.requestFullscreen?.().catch(() => {}); }}>Pantalla completa</button>
              <button className="boton secundario" type="button" onClick={() => dialogo.current?.close()}>Cerrar</button>
            </div>
            <p className="quieto pequeno" style={{ marginBottom: 0 }}>
              Para cambiar la sucursal o desvincular este equipo, entra a Prezio › Equipos.
            </p>
          </>
        )}
      </dialog>
    </div>
  );
}
