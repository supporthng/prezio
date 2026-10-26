"use client";

import { useEffect, useState } from "react";
import { driveConfigurado, elegirArchivoDrive } from "@/lib/googleDrive";

/** Página que abre la app Prezio Administrador en el NAVEGADOR del equipo: Google no deja usar el selector de Drive
 *  dentro de la ventana de la app (bloquea sus cookies). Aquí la persona elige el archivo y esta página se lo entrega
 *  a la app por una dirección local de un solo uso (127.0.0.1), con el permiso de una hora «drive.file». */
export function Elegir() {
  const [puerto, setPuerto] = useState("");
  const [clave, setClave] = useState("");
  const [estado, setEstado] = useState<{ tipo: "listo" | "trabajando" | "error" | "fin"; texto?: string }>({ tipo: "listo" });

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setPuerto(q.get("p") ?? ""); setClave(q.get("s") ?? "");
  }, []);

  const valido = /^[0-9]{2,5}$/.test(puerto) && /^[A-Za-z0-9_-]{8,64}$/.test(clave);

  function entregar(datos: Record<string, string>) {
    const q = new URLSearchParams({ s: clave, ...datos });
    window.location.href = `http://127.0.0.1:${puerto}/?${q.toString()}`;
  }

  async function elegir() {
    setEstado({ tipo: "trabajando", texto: "Abriendo Google Drive…" });
    try {
      const a = await elegirArchivoDrive();
      if (!a) { entregar({ cancelado: "1" }); setEstado({ tipo: "fin", texto: "Cancelado. Ya puedes cerrar esta pestaña." }); return; }
      entregar({ id: a.id, nombre: a.nombre, mime: a.mime, token: a.token });
      setEstado({ tipo: "fin", texto: `«${a.nombre}» elegido. Ya puedes cerrar esta pestaña y volver a Prezio.` });
    } catch (e) {
      setEstado({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo abrir Google Drive." });
    }
  }

  return (
    <main className="contenido" style={{ maxWidth: 520, textAlign: "center", paddingTop: "12vh" }}>
      <h1>Elegir de Google Drive</h1>
      {!valido && <p className="aviso error">Esta página la abre la app Prezio Administrador. Vuelve a la app y pulsa «Elegir de Google Drive».</p>}
      {valido && !driveConfigurado() && <p className="aviso error">Google Drive todavía no está configurado en Prezio.</p>}
      {valido && driveConfigurado() && estado.tipo !== "fin" && (
        <>
          <p className="quieto">Elige el Excel o la hoja de Google con los precios. Prezio solo verá ese archivo, no el resto de tu Drive.</p>
          <button className="boton" type="button" onClick={elegir} disabled={estado.tipo === "trabajando"}>Elegir archivo</button>
        </>
      )}
      {estado.texto && <p className={estado.tipo === "error" ? "aviso error" : "quieto"} role="status">{estado.texto}</p>}
    </main>
  );
}
