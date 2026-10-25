"use client";

import { useMemo, useRef, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config";
import { mensajeError } from "@/lib/util";

// Mismo correo interno que la base (public.correo_de_usuario) para usuarios sin correo.
const correoDeUsuario = (negocio: string, usuario: string) => `${usuario.trim().toLowerCase()}@n${negocio.replace(/-/g, "")}.prezio.invalid`;

type Props = { clave: string; onListo: () => void; onCancelar: () => void };
type Opcion = { negocioId: string; negocio: string; sucursales: { id: string; nombre: string }[] };

/** Vincular desde el propio equipo: entra el dueño, un admin o el encargado (solo para autorizar),
 *  elige negocio y sucursal. La sesión no se guarda en el equipo y se cierra al terminar. */
export function Autorizar({ clave, onListo, onCancelar }: Props) {
  const cliente = useRef<SupabaseClient | null>(null);
  const [paso, setPaso] = useState<"entrar" | "elegir">("entrar");
  const [correo, setCorreo] = useState("");
  const [codigoNegocio, setCodigoNegocio] = useState(() => { try { return localStorage.getItem("prezio_negocio") ?? ""; } catch { return ""; } });
  const conUsuario = correo.trim() !== "" && !correo.includes("@");
  const [contrasena, setContrasena] = useState("");
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  const [negocioId, setNegocioId] = useState("");
  const [sucursalId, setSucursalId] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const elegido = useMemo(() => opciones.find((o) => o.negocioId === negocioId), [opciones, negocioId]);

  const sb = () => (cliente.current ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));

  async function salir() {
    await cliente.current?.auth.signOut({ scope: "local" }).catch(() => {});
    cliente.current = null;
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setTrabajando(true);
    try {
      const s = sb();
      let email = correo.trim();
      if (conUsuario) {
        // Usuario sin correo: negocio + usuario.
        const { data: id } = await s.rpc("negocio_de_slug", { p_slug: codigoNegocio.trim().toLowerCase() });
        if (!id) throw new Error("Negocio, usuario o clave incorrectos.");
        email = correoDeUsuario(String(id), email);
        try { localStorage.setItem("prezio_negocio", codigoNegocio.trim().toLowerCase()); } catch { /* sin almacenamiento */ }
      }
      const { data, error: e1 } = await s.auth.signInWithPassword({ email, password: contrasena });
      if (e1 || !data.user) throw e1 ?? new Error("No se pudo entrar.");
      setContrasena("");
      // Dónde puede poner equipos: negocios donde es dueño o admin (todas sus sucursales) o encargado (la suya).
      // Dónde puede poner equipos: la casilla «Equipos» (en todas o en algunas sucursales); el dueño, siempre.
      const { data: mios } = await s.from("miembros").select("negocio_id, rol, permisos, sucursales").eq("user_id", data.user.id);
      type M = { negocio_id: string; rol: string; permisos: string[] | null; sucursales: string[] | null };
      const permitidos = ((mios ?? []) as M[])
        .filter((m) => m.rol === "dueno" || ((m.permisos ?? []).includes("equipos") && (m.sucursales === null || m.sucursales.length > 0)));
      if (!permitidos.length) throw new Error("Este usuario no puede vincular equipos: necesita la casilla «Equipos» (Prezio › Usuarios).");
      const ids = permitidos.map((m) => m.negocio_id);
      const [{ data: negs }, { data: sucs }] = await Promise.all([
        s.from("negocios").select("id, nombre").in("id", ids).order("nombre"),
        s.from("sucursales").select("id, nombre, negocio_id, es_principal").in("negocio_id", ids)
          .order("es_principal", { ascending: false }).order("nombre"),
      ]);
      const lista: Opcion[] = ((negs ?? []) as { id: string; nombre: string }[]).map((n) => {
        const m = permitidos.find((x) => x.negocio_id === n.id)!;
        const todas = ((sucs ?? []) as { id: string; nombre: string; negocio_id: string }[]).filter((x) => x.negocio_id === n.id);
        return { negocioId: n.id, negocio: n.nombre, sucursales: m.rol === "dueno" || m.sucursales === null ? todas : todas.filter((x) => m.sucursales!.includes(x.id)) };
      }).filter((o) => o.sucursales.length);
      if (!lista.length) throw new Error("No hay sucursales disponibles para este usuario.");
      setOpciones(lista);
      setNegocioId(lista[0].negocioId);
      setSucursalId(lista[0].sucursales[0].id);
      setPaso("elegir");
    } catch (e2) {
      await salir();
      setError(e2 instanceof Error && !("code" in e2) ? e2.message : mensajeError(e2 as { message?: string }));
    } finally {
      setTrabajando(false);
    }
  }

  async function vincular(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setTrabajando(true);
    const { error: e1 } = await sb().rpc("vincular_en_equipo", { p_clave: clave, p_sucursal: sucursalId, p_nombre: nombre });
    setTrabajando(false);
    if (e1) { setError(mensajeError(e1)); return; }
    await salir();
    onListo();
  }

  return (
    <div className="equipo-autorizar">
      {paso === "entrar" ? (
        <form onSubmit={entrar}>
          <h2>Vincular aquí</h2>
          <p className="quieto">Entra con el dueño o con un usuario que tenga la casilla «Equipos» (correo, o usuario y licencia del negocio). Es solo para autorizar: la sesión no se queda en este equipo.</p>
          <label htmlFor="a-correo">Correo o usuario</label>
          <input id="a-correo" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} value={correo}
            onChange={(e) => setCorreo(e.target.value)} required autoFocus />
          {conUsuario && (
            <>
              <label htmlFor="a-negocio-codigo">Licencia del negocio</label>
              <input id="a-negocio-codigo" autoComplete="off" autoCapitalize="none" spellCheck={false} value={codigoNegocio}
                onChange={(e) => setCodigoNegocio(e.target.value)} required placeholder="PREZIO-XXXX-XXXX-XXXX" />
            </>
          )}
          <label htmlFor="a-clave">Clave</label>
          <input id="a-clave" type="password" autoComplete="off" value={contrasena} onChange={(e) => setContrasena(e.target.value)} required />
          {error && <p className="equipo-error" role="alert">{error}</p>}
          <div className="fila">
            <button className="boton marca" type="submit" disabled={trabajando}>{trabajando ? "Entrando…" : "Entrar"}</button>
            <button className="boton fantasma" type="button" onClick={() => { void salir(); onCancelar(); }}>Volver al código</button>
          </div>
        </form>
      ) : (
        <form onSubmit={vincular}>
          <h2>¿Dónde va este equipo?</h2>
          {opciones.length > 1 && (
            <>
              <label htmlFor="a-negocio">Negocio</label>
              <select id="a-negocio" value={negocioId} onChange={(e) => {
                setNegocioId(e.target.value);
                setSucursalId(opciones.find((o) => o.negocioId === e.target.value)?.sucursales[0]?.id ?? "");
              }}>
                {opciones.map((o) => <option key={o.negocioId} value={o.negocioId}>{o.negocio}</option>)}
              </select>
            </>
          )}
          <label htmlFor="a-sucursal">Sucursal{opciones.length === 1 && <span className="quieto"> · {opciones[0].negocio}</span>}</label>
          <select id="a-sucursal" value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} required>
            {elegido?.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <label htmlFor="a-nombre">Nombre del equipo <span className="quieto">(opcional)</span></label>
          <input id="a-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} placeholder="Ej.: Pasillo 3" />
          {error && <p className="equipo-error" role="alert">{error}</p>}
          <div className="fila">
            <button className="boton marca" type="submit" disabled={trabajando || !sucursalId}>{trabajando ? "Vinculando…" : "Vincular este equipo"}</button>
            <button className="boton fantasma" type="button" onClick={() => { void salir(); onCancelar(); }}>Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}
