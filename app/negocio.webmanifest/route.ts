import { NextResponse, type NextRequest } from "next/server";
import { dominioBase, subdominioDe } from "@/lib/subdominio";
import { sitio } from "@/lib/util";

const SLUG = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;

/**
 * Manifiesto para instalar el panel de un negocio en el celular.
 * En su dirección propia (onetech.prezcio.app) la app abre en «/»; en prezcio.app, en /n/<negocio>.
 */
export function GET(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const sub = subdominioDe(host, dominioBase(sitio()));
  const pedido = (request.nextUrl.searchParams.get("n") ?? "").toLowerCase();
  const slug = sub ?? (SLUG.test(pedido) ? pedido : "");
  if (!slug) return new NextResponse("No encontrado", { status: 404 });
  const base = sub ? "/" : `/n/${slug}`;
  const nombre = (request.nextUrl.searchParams.get("t") ?? "").trim().slice(0, 40) || slug.toUpperCase();
  const manifiesto = {
    id: base,
    name: `${nombre} · Prezcio`,
    short_name: nombre.slice(0, 14),
    description: "Panel de tu negocio en Prezcio: sucursales, lectores, ofertas y precios.",
    start_url: base,
    scope: base,
    display: "standalone",
    orientation: "portrait",
    background_color: "#102a43",
    theme_color: "#102a43",
    icons: [
      { src: "/iconos/prezio-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/iconos/prezio-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/iconos/prezio-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return NextResponse.json(manifiesto, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
