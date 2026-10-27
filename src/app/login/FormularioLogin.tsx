"use client";

import { useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";

export function FormularioLogin() {
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [ver, setVer] = useState(false);

  async function entrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const datos = new FormData(e.currentTarget);
    const supabase = supabaseNavegador();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(datos.get("correo")).trim(),
      password: String(datos.get("clave")),
    });
    if (error || !data.user) {
      setCargando(false);
      setError(
        error?.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos."
          : "No se pudo entrar. Revisa tu conexión e intenta de nuevo.",
      );
      return;
    }
    const { data: perfil } = await supabase.from("perfiles").select("rol, activo").eq("id", data.user.id).single();
    if (!perfil || !perfil.activo) {
      await supabase.auth.signOut();
      setCargando(false);
      setError("Tu usuario está desactivado. Habla con la oficina.");
      return;
    }
    window.location.href = perfil.rol === "tecnico" ? "/tecnico" : "/oficina";
  }

  return (
    <form onSubmit={entrar} className="space-y-5">
      <div>
        <label className="etiqueta text-[13px]" htmlFor="correo">Correo</label>
        <input id="correo" name="correo" type="email" required autoComplete="email" placeholder="tu@empresa.com" className="campo h-12 text-[15px]" />
      </div>
      <div>
        <label className="etiqueta text-[13px]" htmlFor="clave">Contraseña</label>
        <div className="relative">
          <input id="clave" name="clave" type={ver ? "text" : "password"} required autoComplete="current-password" className="campo h-12 pr-12 text-[15px]" />
          <button
            type="button"
            onClick={() => setVer((v) => !v)}
            className="absolute top-1 right-1 inline-flex h-10 w-10 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100"
            aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
              {ver && <path d="M3 3l18 18" />}
            </svg>
          </button>
        </div>
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button type="submit" className="boton h-12 w-full text-base" disabled={cargando}>
        {cargando ? "Entrando…" : "Entrar"}
      </button>
      <p className="text-center text-xs text-stone-500">¿No tienes usuario? Pídelo al administrador.</p>
    </form>
  );
}
