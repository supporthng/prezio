"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/browser";
import { crearSalida } from "@/lib/salida";
import { mensajeError } from "@/lib/util";

/** La clave para salir de las apps Prezio. Se calcula su huella aquí: la clave no sale del navegador. */
export function ClaveSalida({ negocioId, puesta }: { negocioId: string; puesta: string | null }) {
  const router = useRouter();
  const [clave, setClave] = useState("");
  const [otra, setOtra] = useState("");
  const [estado, setEstado] = useState<{ tipo: "error" | "bien"; texto: string } | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const corta = clave.length > 0 && clave.length < 4;
  const distinta = otra.length > 0 && otra !== clave;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (clave.length < 4 || clave !== otra) return;
    setTrabajando(true); setEstado(null);
    const { error } = await supabaseNavegador().rpc("guardar_salida", { p_negocio: negocioId, p_salida: await crearSalida(clave) });
    setTrabajando(false);
    if (error) { setEstado({ tipo: "error", texto: mensajeError(error) }); return; }
    setClave(""); setOtra("");
    setEstado({ tipo: "bien", texto: "Clave guardada. Los equipos la reciben en su próxima revisión (máximo 5 minutos)." });
    router.refresh();
  }

  return (
    <section className="tarjeta" aria-labelledby="t-salida" style={{ marginTop: 20 }}>
      <h2 id="t-salida">Clave para salir de las apps</h2>
      <p className="quieto" style={{ marginTop: 0 }}>
        Las apps Prezio no dejan salir del verificador. Para mantenimiento: menú ⓘ › «Salir de la app» y esta clave.
        Funciona aunque no haya internet. {puesta ? `Última vez cambiada: ${new Date(puesta).toLocaleDateString("es-DO")}.` : "Todavía no hay clave."}
      </p>
      <form className="fila" onSubmit={guardar}>
        <div className="campo" style={{ marginBottom: 0 }}>
          <label htmlFor="s-clave">{puesta ? "Clave nueva" : "Clave"}</label>
          <input id="s-clave" type="password" inputMode="numeric" autoComplete="new-password" minLength={4} maxLength={40}
            value={clave} onChange={(e) => setClave(e.target.value)} />
        </div>
        <div className="campo" style={{ marginBottom: 0 }}>
          <label htmlFor="s-otra">Repítela</label>
          <input id="s-otra" type="password" inputMode="numeric" autoComplete="new-password" maxLength={40}
            value={otra} onChange={(e) => setOtra(e.target.value)} />
        </div>
        <button className="boton" type="submit" disabled={trabajando || clave.length < 4 || clave !== otra}>Guardar clave</button>
      </form>
      {corta && <p className="error-campo">Mínimo 4 caracteres.</p>}
      {distinta && <p className="error-campo">Las dos claves no coinciden.</p>}
      {estado && <p className={`aviso ${estado.tipo}`} role={estado.tipo === "error" ? "alert" : "status"} style={{ marginTop: 12, marginBottom: 0 }}>{estado.texto}</p>}
    </section>
  );
}
