/** Logotipo de Prezio: una etiqueta de precio con su perforación + el nombre. */
export function Marca({ claro = false, tamano = 28 }: { claro?: boolean; tamano?: number }) {
  const color = claro ? "#f2f5f8" : "currentColor";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }} aria-label="Prezio">
      <svg width={tamano} height={tamano} viewBox="0 0 32 32" aria-hidden="true">
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H17l11 11-13 13L4 17V6.5Z" fill="#ffd23f" />
        <circle cx="10" cy="10" r="2.6" fill="#102a43" />
      </svg>
      <span style={{ fontWeight: 800, fontSize: tamano * 0.82, letterSpacing: "-0.04em", color }}>prezio</span>
    </span>
  );
}
