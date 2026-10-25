"use client";

import { useEffect, useState } from "react";
import { EntradaMarco } from "@/components/EntradaMarco";
import { supabaseNavegador } from "@/lib/supabase/browser";
import { rutaSegura } from "@/lib/util";

export function Sesion() {
  const [error, setError] = useState("");
  useEffect(() => {
    const frag = new URLSearchParams(location.hash.slice(1));
    const busq = new URLSearchParams(location.search);
    history.replaceState(null, "", location.pathname);   // los tokens no quedan en la barra ni en el historial
    const acceso = frag.get("access_token"), renovar = frag.get("refresh_token");
    const tipo = frag.get("type");
    let destino = rutaSegura(frag.get("siguiente") ?? busq.get("siguiente"));
    if (tipo === "invite" || tipo === "recovery") destino = `/cuenta/clave?nuevo=1&siguiente=${encodeURIComponent(destino)}`;
    if (frag.get("error_description") || !acceso || !renovar) {
      setError(frag.get("error_code") === "otp_expired" ? "El enlace venció o ya se usó. Pide uno nuevo." : "No se pudo entrar con este enlace.");
      return;
    }
    supabaseNavegador().auth.setSession({ access_token: acceso, refresh_token: renovar }).then(({ error: e }) => {
      if (e) setError("La sesión venció. Vuelve a entrar.");
      else location.replace(destino);
    });
  }, []);
  return (
    <EntradaMarco>
      {error ? (
        <>
          <h1>No se pudo entrar</h1>
          <p className="quieto">{error}</p>
          <a className="boton" href="/entrar">Ir a Entrar</a>
        </>
      ) : (
        <>
          <h1>Entrando…</h1>
          <p className="quieto">Un momento.</p>
        </>
      )}
    </EntradaMarco>
  );
}
