"use client";

import { useState } from "react";

/** La licencia del negocio (PREZIO-XXXX-XXXX-XXXX): con ella entran sus usuarios, en la web y en la app. */
export function CodigoNegocio({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="codigo-negocio">
      <div>
        <span className="codigo-negocio-etq">Licencia del negocio</span>
        <code>{codigo}</code>
      </div>
      <button type="button" className="boton secundario"
        onClick={async () => { await navigator.clipboard?.writeText(codigo).catch(() => {}); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }}>
        {copiado ? "Copiado" : "Copiar"}
      </button>
      <p className="quieto pequeno">Es el código con el que tus usuarios entran (con su usuario y clave), en la web y en la app Prezio Administrador.</p>
    </div>
  );
}
