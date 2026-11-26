"use client";

import { useEffect, useState } from "react";

/** Al llegar desde la dirección propia del negocio para usar Google Drive: avisa que hay que tocar el botón otra vez. */
export function AvisoDrive() {
  const [ver, setVer] = useState(false);
  useEffect(() => { setVer(new URLSearchParams(window.location.search).get("drive") === "1"); }, []);
  if (!ver) return null;
  return (
    <p className="aviso bien" role="status" style={{ margin: "12px 0 0" }}>
      Listo: para usar Google Drive te pasamos a prezcio.app (tu sesión es la misma). Toca <b>Elegir de Google Drive</b> otra vez.
    </p>
  );
}
