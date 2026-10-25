"use client";

import { useState } from "react";

/** El código del negocio (para entrar con usuario en la web y en la app Prezio Administrador), con botón de copiar. */
export function CodigoNegocio({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="codigo-negocio">
      <div>
        <span className="codigo-negocio-etq">Código del negocio</span>
        <code>{codigo}</code>
      </div>
      <button type="button" className="boton secundario"
        onClick={async () => { await navigator.clipboard?.writeText(codigo).catch(() => {}); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }}>
        {copiado ? "Copiado" : "Copiar"}
      </button>
      <p className="quieto pequeno">Tus usuarios lo escriben para entrar con su usuario, en la web y en la app Prezio Administrador.</p>
    </div>
  );
}
