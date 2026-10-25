"use client";

import { useMemo, useState } from "react";
import { qrSvg } from "@/lib/qr";
import { supabaseNavegador } from "@/lib/supabase/browser";
import { mensajeError } from "@/lib/util";

type Props = { url: string; negocio: string; sucursal: string; archivo: string; negocioId: string; puedeApariencia: boolean };

/** Enlace y QR de la consulta desde el celular de una sucursal: copiar, descargar, imprimir y usar en la pantalla. */
export function QrSucursal({ url, negocio, sucursal, archivo, negocioId, puedeApariencia }: Props) {
  const svg = useMemo(() => qrSvg(url), [url]);
  const [aviso, setAviso] = useState<{ tipo: "bien" | "error"; texto: string } | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  async function png(lado = 1024): Promise<Blob> {
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    await img.decode();
    const c = document.createElement("canvas");
    c.width = c.height = lado;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, lado, lado);
    return new Promise((ok) => c.toBlob((b) => ok(b!), "image/png"));
  }
  function bajar(blob: Blob, nombre: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nombre; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function imprimir() {
    const w = window.open("", "_blank", "width=700,height=900");
    if (!w) return;
    const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>QR · ${esc(sucursal)}</title>
      <style>body{font-family:system-ui,sans-serif;text-align:center;color:#102a43;margin:40px}h1{font-size:34px;margin:0 0 6px}
      p{font-size:20px;margin:0 0 24px}.qr{width:12cm;margin:0 auto}.qr svg{width:100%;height:auto}small{display:block;margin-top:18px;color:#5b6b7c;font-size:14px}</style>
      </head><body><h1>Consulta los precios con tu celular</h1><p>${esc(negocio)} · ${esc(sucursal)}</p><div class="qr">${svg}</div>
      <small>Abre la cámara del celular y apunta a este código</small><script>onload=()=>{print()}</script></body></html>`);
    w.document.close();
  }
  async function usarEnPantalla() {
    setTrabajando(true); setAviso(null);
    try {
      const sb = supabaseNavegador();
      const ruta = `${negocioId}/qr.png`;
      const { error: e1 } = await sb.storage.from("marcas").upload(ruta, await png(600), { upsert: true, contentType: "image/png", cacheControl: "60" });
      if (e1) throw e1;
      const enlace = sb.storage.from("marcas").getPublicUrl(ruta).data.publicUrl + `?v=${Date.now()}`;
      const { data, error: e2 } = await sb.from("negocios").select("apariencia").eq("id", negocioId).single();
      if (e2) throw e2;
      const apariencia = { ...((data as { apariencia: Record<string, unknown> }).apariencia ?? {}), qr: enlace, mostrar_qr: true };
      const { error: e3 } = await sb.from("negocios").update({ apariencia }).eq("id", negocioId);
      if (e3) throw e3;
      setAviso({ tipo: "bien", texto: "Listo: el QR sale en la pantalla de los verificadores (Apariencia › QR). Los equipos lo toman en su próxima revisión." });
    } catch (e) {
      setAviso({ tipo: "error", texto: mensajeError(e as { message?: string }) });
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div className="qr-sucursal">
      <div className="qr-imagen" role="img" aria-label={`Código QR de ${url}`} dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="qr-acciones">
        <label htmlFor={`enlace-${archivo}`}>Enlace para los clientes</label>
        <div className="fila" style={{ gap: 8, flexWrap: "nowrap" }}>
          <input id={`enlace-${archivo}`} readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <button className="boton secundario" type="button"
            onClick={async () => { await navigator.clipboard?.writeText(url).catch(() => {}); setAviso({ tipo: "bien", texto: "Enlace copiado." }); }}>Copiar</button>
        </div>
        <div className="fila" style={{ gap: 8, marginTop: 10 }}>
          <button className="boton secundario" type="button" onClick={async () => bajar(await png(), `qr-${archivo}.png`)}>Descargar PNG</button>
          <button className="boton secundario" type="button" onClick={() => bajar(new Blob([svg], { type: "image/svg+xml" }), `qr-${archivo}.svg`)}>Descargar SVG</button>
          <button className="boton secundario" type="button" onClick={imprimir}>Imprimir cartel</button>
          <a className="boton secundario" href={url} target="_blank" rel="noopener noreferrer">Probar</a>
        </div>
        {puedeApariencia && (
          <button className="boton" type="button" style={{ marginTop: 10 }} disabled={trabajando} onClick={usarEnPantalla}>
            {trabajando ? "Guardando…" : "Mostrar este QR en la pantalla del verificador"}
          </button>
        )}
        {aviso && <p className={`aviso ${aviso.tipo}`} role={aviso.tipo === "error" ? "alert" : "status"} style={{ marginTop: 10, marginBottom: 0 }}>{aviso.texto}</p>}
      </div>
    </div>
  );
}
