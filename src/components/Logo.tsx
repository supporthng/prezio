/** Marca de Fumio: hoja con la ruta punteada y el punto de llegada */
export function Marca({ tam = 34 }: { tam?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 120 120" aria-hidden="true" className="shrink-0">
      <rect width="120" height="120" rx="30" fill="#14563A" />
      <path d="M30 88 C30 52 52 30 90 30 C90 68 68 90 30 90 Z" fill="#E9F7D9" />
      <path
        d="M38 82 C50 74 54 66 60 60 C66 54 74 50 82 38"
        fill="none"
        stroke="#14563A"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="1 9"
      />
      <circle cx="38" cy="82" r="6" fill="#C6F05A" />
    </svg>
  );
}

export function Logo({ claro = false, chico = false }: { claro?: boolean; chico?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Marca tam={chico ? 30 : 42} />
      <span
        className={`font-display font-bold tracking-tight ${chico ? "text-xl" : "text-[28px]"} ${claro ? "text-white" : "text-marca-900"}`}
      >
        fumio
      </span>
    </span>
  );
}
