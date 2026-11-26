/** Lector de códigos de barras con la cámara del celular (en vivo, sin tomar foto). Misma lógica que el lector del
 *  sistema anterior, que ya funciona en las tiendas:
 *  - Cámara trasera; lee con el lector del navegador (BarcodeDetector: Chrome en Android). En iPhone y otros carga una
 *    versión compatible basada en ZXing-C++ (librería «barcode-detector», versión fija).
 *  - Solo lecturas seguras: dígito verificador correcto, el código sobre la línea roja y el mismo código en 3 imágenes
 *    seguidas. Los UPC-E se devuelven como están impresos (8 dígitos).
 *  - Pitido (suena también en iPhone en silencio, tras un primer toque), vibración, linterna si el teléfono la permite. */

const LECTOR_COMPATIBLE = "https://cdn.jsdelivr.net/npm/barcode-detector@3.1.3/dist/iife/ponyfill.js";
const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"];
const CONFIRMACIONES = 3;
const ESPERA_INICIAL = 1000;

type Detectado = { rawValue?: string; format?: string; boundingBox?: { x: number; y: number; width: number; height: number } };
type Detector = { detect(fuente: CanvasImageSource): Promise<Detectado[]> };
type ConstructorDetector = { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };

let detectorListo: Promise<Detector> | null = null;

function cargarScript(src: string): Promise<void> {
  return new Promise((ok, mal) => {
    const s = document.createElement("script");
    s.src = src; s.async = true; s.crossOrigin = "anonymous";
    s.onload = () => ok();
    s.onerror = () => mal(new Error("No se pudo cargar el lector"));
    document.head.appendChild(s);
  });
}

async function obtenerDetector(): Promise<Detector> {
  const w = window as unknown as { BarcodeDetector?: ConstructorDetector; BarcodeDetectionAPI?: { BarcodeDetector: ConstructorDetector } };
  if (w.BarcodeDetector) {
    try {
      const soportados = (await w.BarcodeDetector.getSupportedFormats?.()) ?? [];
      const f = FORMATOS.filter((x) => soportados.includes(x));
      if (f.length) return new w.BarcodeDetector({ formats: f });
    } catch { /* se usa la versión compatible */ }
  }
  if (!w.BarcodeDetectionAPI?.BarcodeDetector) await cargarScript(LECTOR_COMPATIBLE);
  if (!w.BarcodeDetectionAPI?.BarcodeDetector) throw new Error("No se pudo cargar el lector");
  return new w.BarcodeDetectionAPI.BarcodeDetector({ formats: FORMATOS });
}

/** Dígito verificador de EAN-13, EAN-8 y UPC-A (descarta lecturas equivocadas). */
export function digitoValido(valor: string, formato?: string): boolean {
  if (!["ean_13", "ean_8", "upc_a"].includes(formato ?? "")) return true;
  if (!/^\d+$/.test(valor) || ![8, 12, 13].includes(valor.length)) return false;
  const d = valor.split("").map(Number), control = d.pop() as number;
  let suma = 0;
  d.reverse().forEach((x, k) => { suma += x * (k % 2 === 0 ? 3 : 1); });
  return (10 - (suma % 10)) % 10 === control;
}

/** Los UPC-E a veces llegan «expandidos» (0087800000058): se devuelven como están impresos (08780538). */
export function upceImpreso(valor: string, formato?: string): string {
  if (formato !== "upc_e" || !/^\d+$/.test(valor) || valor.length === 8) return valor;
  let a = valor;
  if (a.length === 13 && a[0] === "0") a = a.slice(1);
  if (a.length !== 12 || !"01".includes(a[0])) return valor;
  const ns = a[0], f = a.slice(1, 6), p = a.slice(6, 11), c = a[11];
  let d: string | null = null;
  if ("012".includes(f[2]) && f.slice(3) === "00" && p.slice(0, 2) === "00") d = f.slice(0, 2) + p.slice(2, 5) + f[2];
  else if (f.slice(3) === "00" && p.slice(0, 3) === "000") d = f.slice(0, 3) + p.slice(3, 5) + "3";
  else if (f[4] === "0" && p.slice(0, 4) === "0000") d = f.slice(0, 4) + p[4] + "4";
  else if (p.slice(0, 4) === "0000" && "56789".includes(p[4])) d = f + p[4];
  return d ? ns + d + c : valor;
}

// ---------------------------------------------------------------- pitido
function crearWav(segundos: number, conTono: boolean): string {
  const sr = 22050, n = Math.floor(sr * segundos), buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const txt = (o: number, t: string) => { for (let k = 0; k < t.length; k++) v.setUint8(o + k, t.charCodeAt(k)); };
  txt(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); txt(8, "WAVE"); txt(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  txt(36, "data"); v.setUint32(40, n * 2, true);
  for (let k = 0; conTono && k < n; k++) {
    const env = Math.min(1, k / 150, (n - k) / 300);
    const onda = Math.sin((2 * Math.PI * 2700 * k) / sr) >= 0 ? 1 : -1;
    v.setInt16(44 + k * 2, Math.round(onda * env * 0.55 * 32767), true);
  }
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

let sonido: { bip: HTMLAudioElement; tono: string; silencio: string; listo: boolean } | null = null;
/** Llamar dentro de un toque del usuario (los navegadores exigen un toque para permitir sonido). */
export function activarSonido(): void {
  if (typeof window === "undefined") return;
  if (!sonido) { const tono = crearWav(0.12, true); sonido = { bip: new Audio(tono), tono, silencio: crearWav(0.05, false), listo: false }; }
  if (sonido.listo) return;
  const s = sonido;
  s.bip.src = s.silencio;
  s.bip.play().then(() => { s.listo = true; s.bip.pause(); s.bip.src = s.tono; s.bip.load(); }).catch(() => { s.bip.src = s.tono; });
}
function pitido() {
  if (!sonido) return;
  try { sonido.bip.currentTime = 0; } catch { /* nada */ }
  sonido.bip.play().catch(() => {});
}

/** Brillo promedio (0–255) de la franja central, muestreando ~400 puntos. */
function brillo(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const y0 = Math.round(h * 0.3), alto = Math.max(1, Math.round(h * 0.4));
  const d = ctx.getImageData(0, y0, w, alto).data;
  const paso = Math.max(4, Math.floor(d.length / 4 / 400)) * 4;
  let suma = 0, n = 0;
  for (let i = 0; i < d.length; i += paso) { suma += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++; }
  return n ? suma / n : 255;
}

// ---------------------------------------------------------------- lector en vivo
export type Lector = { detener(): void };

/** Abre la cámara dentro de `caja` y llama `alLeer(código)` con una lectura segura. `avisar` recibe guías. */
export async function abrirLector(caja: HTMLElement, alLeer: (codigo: string) => void, avisar: (texto: string) => void): Promise<Lector> {
  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;
  let abierto = 0, activo = true, candidato: { valor: string; veces: number; t: number } | null = null;
  let guia = "", guiaT = 0, oscuro = false, conZoom = false, linterna: HTMLButtonElement | null = null;
  const lienzo = document.createElement("canvas");
  const detener = () => {
    activo = false;
    stream?.getTracks().forEach((t) => t.stop());
    if (video) { video.srcObject = null; video.remove(); }
    caja.querySelectorAll(".linterna").forEach((b) => b.remove());
    clearInterval(guias);
  };
  const GUIA = ["🎯 Pon el código sobre la línea roja", "🔍 Acerca un poco el teléfono", "↔️ Aleja un poco el teléfono", "✋ Mantén el teléfono quieto un momento"];
  const guias = setInterval(() => {
    if (!abierto) return;
    const seg = (Date.now() - abierto) / 1000, reciente = Date.now() - guiaT < 700;
    if (oscuro && !(reciente && guia === "enfocando")) {
      avisar(linterna && !linterna.classList.contains("encendida")
        ? "💡 Hay poca luz: toca 🔦 para encender la linterna"
        : "💡 Hay poca luz: acércate a una lámpara o gira el producto hacia la luz");
      linterna?.classList.toggle("llamar", !linterna.classList.contains("encendida"));
      return;
    }
    linterna?.classList.remove("llamar");
    if (reciente && guia === "enfocando") avisar("🔎 Enfocando… mantén el teléfono quieto");
    else if (reciente && guia === "acercar") avisar("🔍 Acerca el código: se ve muy pequeño");
    else if (reciente && guia === "centrar") avisar("🎯 Pon el código sobre la línea roja");
    else avisar(seg < 2.5 ? (conZoom ? "📏 Distancia ideal: 20–30 cm del código" : "📏 Distancia ideal: 15–20 cm del código") : GUIA[Math.floor((seg - 2.5) / 2.2) % GUIA.length]);
  }, 500);

  try {
    avisar("Abriendo la cámara…");
    const detectorPedido = (detectorListo ??= obtenerDetector().catch((e) => { detectorListo = null; throw e; }));
    detectorPedido.catch(() => {});   // si la cámara falla antes, que el error del lector no quede suelto
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    video = document.createElement("video");
    video.setAttribute("playsinline", ""); video.muted = true; video.autoplay = true; video.srcObject = stream;
    caja.prepend(video);
    await video.play().catch(() => {});
    const pista = stream.getVideoTracks()[0];
    try {
      const cap = (pista.getCapabilities?.() ?? {}) as {
        focusMode?: string[]; exposureMode?: string[]; whiteBalanceMode?: string[]; torch?: boolean; zoom?: { min: number; max: number };
      };
      // Cada ajuste por separado: si el teléfono rechaza uno, los demás igual se aplican.
      const ajustar = (c: Record<string, unknown>) => pista.applyConstraints({ advanced: [c as MediaTrackConstraintSet] }).then(() => true, () => false);
      if (cap.focusMode?.includes("continuous")) await ajustar({ focusMode: "continuous" });
      if (cap.exposureMode?.includes("continuous")) await ajustar({ exposureMode: "continuous" });
      if (cap.whiteBalanceMode?.includes("continuous")) await ajustar({ whiteBalanceMode: "continuous" });
      // Un poco de zoom deja el teléfono más lejos, fuera de la distancia mínima de enfoque
      // (en iPhone es la causa principal de que el código se vea borroso de cerca).
      if (cap.zoom && cap.zoom.max >= 1.5) conZoom = await ajustar({ zoom: Math.min(2, cap.zoom.max, Math.max(cap.zoom.min, 1.8)) });
      if (cap.torch) {
        let encendida = false;
        const b = document.createElement("button");
        b.type = "button"; b.className = "linterna"; b.textContent = "🔦"; b.setAttribute("aria-label", "Encender linterna");
        b.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          try {
            encendida = !encendida;
            await pista.applyConstraints({ advanced: [{ torch: encendida } as MediaTrackConstraintSet] });
            b.classList.toggle("encendida", encendida);
          } catch { b.remove(); }
        });
        caja.appendChild(b);
        linterna = b;
      }
    } catch { /* sin enfoque ni linterna: igual lee */ }
    const detector = await detectorPedido;
    abierto = Date.now();

    let luzT = 0;
    const ciclo = async () => {
      if (!activo || !video) return;
      try {
        if (video.readyState >= 2 && video.videoWidth) {
          const escala = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight));
          const w = (lienzo.width = Math.round(video.videoWidth * escala)), h = (lienzo.height = Math.round(video.videoHeight * escala));
          const ctx = lienzo.getContext("2d", { willReadFrequently: true })!;
          ctx.drawImage(video, 0, 0, w, h);
          if (Date.now() - luzT > 1000) { luzT = Date.now(); oscuro = brillo(ctx, w, h) < 70; }
          const r = (await detector.detect(lienzo)) || [];
          if (!activo) return;
          const ahora = Date.now();
          let elegido: string | null = null, motivo: string | null = null;
          for (const c of r) {
            const valor = upceImpreso(String(c.rawValue ?? "").trim(), c.format);
            if (!valor || !digitoValido(valor, c.format)) continue;
            const b = c.boundingBox;
            let pos = "ok";
            if (b && b.width) {
              const cy = h / 2, cx = b.x + b.width / 2;
              if (Math.max(b.width, b.height) < 0.12 * Math.min(w, h)) pos = "acercar";
              else if (!(b.y <= cy + 0.12 * h && b.y + b.height >= cy - 0.12 * h) || cx < 0.15 * w || cx > 0.85 * w) pos = "centrar";
            }
            if (pos === "ok") { elegido = valor; break; }
            motivo ??= pos;
          }
          if (elegido && ahora - abierto >= ESPERA_INICIAL) {
            if (candidato && candidato.valor === elegido && ahora - candidato.t < 800) { candidato.veces++; candidato.t = ahora; }
            else candidato = { valor: elegido, veces: 1, t: ahora };
            if (candidato.veces >= CONFIRMACIONES) {
              pitido();
              navigator.vibrate?.(80);
              detener();
              alLeer(elegido);
              return;
            }
            guia = "enfocando"; guiaT = ahora;
          } else if (motivo) { guia = motivo; guiaT = ahora; }
          if (candidato && ahora - candidato.t > 800) candidato = null;
        }
      } catch { /* una imagen mala no detiene el lector */ }
      setTimeout(ciclo, 110);
    };
    void ciclo();
  } catch (e) {
    detener();
    avisar(String((e as Error)?.message).includes("lector")
      ? "No se pudo cargar el lector de códigos. Revisa la conexión o escribe el código."
      : "No se pudo abrir la cámara. Revisa el permiso de cámara del navegador o escribe el código.");
    throw e;
  }
  return { detener };
}
