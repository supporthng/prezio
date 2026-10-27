"use client";

import { useEffect } from "react";

/** Abre el diálogo de impresión al cargar el ticket */
export function ImprimirAlAbrir() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="no-imprimir" style={{ display: "flex", gap: 8, justifyContent: "center", padding: 12 }}>
      <button type="button" onClick={() => window.print()} style={{ padding: "8px 16px", borderRadius: 10, border: 0, background: "#14563A", color: "#fff", fontWeight: 700 }}>
        Imprimir
      </button>
      <button type="button" onClick={() => window.close()} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid #CFD8D2", background: "#fff", fontWeight: 600 }}>
        Cerrar
      </button>
    </div>
  );
}
