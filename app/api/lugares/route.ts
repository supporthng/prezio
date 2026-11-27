import { NextResponse, type NextRequest } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export type Lugar = { nombre: string; direccion: string; latitud: number; longitud: number };

/**
 * Buscar un negocio o dirección por nombre para ubicar una sucursal.
 * Con GOOGLE_PLACES_API_KEY en Vercel usa Google (encuentra casi todos los negocios);
 * sin ella usa OpenStreetMap (gratis, pero tiene menos negocios pequeños).
 * Solo para usuarios con sesión: la búsqueda no sale del servidor con datos del cliente, solo el texto buscado.
 */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  const lat = Number(request.nextUrl.searchParams.get("lat")), lon = Number(request.nextUrl.searchParams.get("lon"));
  const cerca = Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon) ? { lat, lon } : null;
  if (q.length < 3) return NextResponse.json({ lugares: [] });
  const supabase = await supabaseServidor();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Vuelve a entrar a Prezcio." }, { status: 401 });

  try {
    const clave = process.env.GOOGLE_PLACES_API_KEY;
    const lugares = clave ? await deGoogle(q, clave, cerca) : await deOpenStreetMap(q, cerca);
    return NextResponse.json({ lugares, fuente: clave ? "google" : "osm" });
  } catch {
    return NextResponse.json({ error: "No se pudo buscar ahora. Intenta de nuevo o pega un enlace de Google Maps." }, { status: 502 });
  }
}

async function deGoogle(q: string, clave: string, cerca: { lat: number; lon: number } | null): Promise<Lugar[]> {
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": clave,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location" },
    body: JSON.stringify({
      textQuery: q, languageCode: "es", regionCode: "DO", pageSize: 8,
      ...(cerca ? { locationBias: { circle: { center: { latitude: cerca.lat, longitude: cerca.lon }, radius: 50000 } } } : {}),
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`google ${r.status}`);
  const j = (await r.json()) as { places?: { displayName?: { text?: string }; formattedAddress?: string; location?: { latitude: number; longitude: number } }[] };
  return (j.places ?? []).filter((p) => p.location).map((p) => ({
    nombre: p.displayName?.text ?? "", direccion: p.formattedAddress ?? "", latitud: p.location!.latitude, longitud: p.location!.longitude,
  }));
}

async function deOpenStreetMap(q: string, cerca: { lat: number; lon: number } | null): Promise<Lugar[]> {
  const u = new URL("https://photon.komoot.io/api/");
  u.searchParams.set("q", q); u.searchParams.set("limit", "8");
  // Por defecto, cerca de Santo Domingo: los clientes de Prezcio están en República Dominicana.
  u.searchParams.set("lat", String(cerca?.lat ?? 18.4861)); u.searchParams.set("lon", String(cerca?.lon ?? -69.9312));
  const r = await fetch(u, { headers: { "User-Agent": "Prezcio/1.0 (https://prezcio.app)" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`photon ${r.status}`);
  type F = { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> };
  const j = (await r.json()) as { features?: F[] };
  return (j.features ?? []).map((f) => {
    const p = f.properties;
    const calle = [p.street, p.housenumber].filter(Boolean).join(" ");
    return {
      nombre: p.name || calle || p.city || q,
      direccion: [p.name ? calle : "", p.district || p.locality, p.city, p.state, p.country].filter(Boolean).join(", "),
      latitud: f.geometry.coordinates[1], longitud: f.geometry.coordinates[0],
    };
  });
}
