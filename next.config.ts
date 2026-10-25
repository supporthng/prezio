import type { NextConfig } from "next";

// Protecciones estándar del navegador para todo el sitio.
const cabeceras = [
  { key: "X-Frame-Options", value: "DENY" },                         // nadie mete Prezio dentro de otra página
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=()" },
];

const nextConfig: NextConfig = {
  // El código se revisa con `npm run typecheck` (y en GitHub › Actions › Pruebas); el lint no frena la publicación.
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:ruta*", headers: cabeceras },
      // El guardián del equipo sin internet siempre se revisa (así toma las versiones nuevas).
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/equipo" }] },
      { source: "/apps.json", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default nextConfig;
