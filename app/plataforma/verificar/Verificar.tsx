"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/browser";

type Alta = { factorId: string; qr: string; secreto: string };

/** Código de 6 dígitos. La primera vez muestra el QR para agregar la cuenta a la app de autenticación. */
export function Verificar({ inscribir, correo, siguiente = "/plataforma" }: { inscribir: boolean; correo: string; siguiente?: string }) {
  const [alta, setAlta] = useState<Alta | null>(null);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const pedido = useRef(false);

  useEffect(() => {
    if (!inscribir || pedido.current) return;
    pedido.current = true;
    (async () => {
      const sb = supabaseNavegador();
      // Restos de un alta que no se terminó: se quitan para empezar limpio.
      const { data: f } = await sb.auth.mfa.listFactors();
      for (const x of f?.all ?? []) if (x.status !== "verified") await sb.auth.mfa.unenroll({ factorId: x.id });
      const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `Prezcio Plataforma ${Date.now()}`, issuer: "Prezcio" });
      if (error || !data) { setError("No se pudo preparar la verificación: " + (error?.message ?? "sin respuesta")); return; }
      setAlta({ factorId: data.id, qr: data.totp.qr_code, secreto: data.totp.secret });
    })();
  }, [inscribir]);

  async function verificar(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setTrabajando(true);
    const sb = supabaseNavegador();
    let factorId = alta?.factorId;
    if (!factorId) {
      const { data: f } = await sb.auth.mfa.listFactors();
      factorId = f?.totp?.find((x) => x.status === "verified")?.id;
    }
    if (!factorId) { setTrabajando(false); setError("No hay una app de autenticación configurada. Recarga la página."); return; }
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: codigo.replace(/\s/g, "") });
    if (error) { setTrabajando(false); setCodigo(""); setError(/invalid|expired/i.test(error.message) ? "Código incorrecto o vencido. Escribe el que muestra la app ahora." : error.message); return; }
    window.location.replace(siguiente);
  }

  return (
    <section className="pe-tarjeta" aria-labelledby="pv-t">
      <h1 id="pv-t">{inscribir ? "Protege tu cuenta" : "Código de verificación"}</h1>
      {inscribir ? (
        <>
          <p className="quieto">La Plataforma pide, además de la clave, un código de la app de autenticación del celular
            (Google Authenticator, Microsoft Authenticator o similar). Se configura una sola vez.</p>
          <ol className="pv-pasos">
            <li>Abre la app en tu celular y toca <b>Agregar</b> › <b>Escanear código QR</b>.</li>
            <li>Escanea este código:</li>
          </ol>
          <div className="pv-qr">
            {alta ? <img src={alta.qr} alt="Código QR para la app de autenticación" width={180} height={180} /> : <span className="quieto">Preparando…</span>}
          </div>
          {alta && (
            <details className="pv-manual"><summary>¿No puedes escanear? Escribe la clave a mano</summary>
              <p className="quieto pequeno">Cuenta: {correo}</p><code>{alta.secreto.replace(/(.{4})/g, "$1 ").trim()}</code></details>
          )}
          <p className="quieto pequeno">3. Escribe abajo el código de 6 dígitos que muestra la app.</p>
        </>
      ) : (
        <p className="quieto">Abre la app de autenticación de tu celular y escribe el código de 6 dígitos de «Prezcio».</p>
      )}
      {error && <p className="aviso error" role="alert">{error}</p>}
      <form onSubmit={verificar}>
        <div className="campo">
          <label htmlFor="pv-codigo">Código</label>
          <input id="pv-codigo" className="pv-codigo" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7}
            required autoFocus value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="123 456" />
        </div>
        <button className="boton ancho" type="submit" disabled={trabajando || (inscribir && !alta)}>{trabajando ? "Verificando…" : "Verificar y entrar"}</button>
      </form>
    </section>
  );
}
