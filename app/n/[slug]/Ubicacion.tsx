"use client";

import { useState } from "react";
import { coordenadasDeTexto, enlaceGoogleMaps, esEnlaceCorto, mapaEmbebido } from "@/lib/ubicacion";
import { guardarUbicacion } from "./actions";

type Props = {
  slug: string; sucursal: string; nombre: string;
  geo: { activa: boolean; latitud: number | null; longitud: number | null; radio_m: number };
};
const RADIOS = [50, 100, 150, 200, 300, 500, 1000];

/** Ubicación de una sucursal: con la ubicación del dispositivo, un enlace de Google Maps o a mano. */
export function Ubicacion({ slug, sucursal, nombre, geo }: Props) {
  const [lat, setLat] = useState(geo.latitud?.toString() ?? "");
  const [lon, setLon] = useState(geo.longitud?.toString() ?? "");
  const [radio, setRadio] = useState(geo.radio_m || 100);
  const [activa, setActiva] = useState(geo.activa);
  const [enlace, setEnlace] = useState("");
  const [aviso, setAviso] = useState("");
  const punto = coordenadasDeTexto(`${lat}, ${lon}`);

  function desdeEnlace(texto: string) {
    setEnlace(texto);
    if (!texto.trim()) { setAviso(""); return; }
    const c = coordenadasDeTexto(texto);
    if (c) { setLat(String(c.latitud)); setLon(String(c.longitud)); setAviso("Ubicación tomada del enlace."); }
    else setAviso(esEnlaceCorto(texto)
      ? "Ese enlace corto no trae la ubicación: ábrelo en el navegador y copia la dirección larga de arriba (la que tiene @18.4…,-69.9…)."
      : "No encontré la ubicación en ese texto.");
  }

  function desdeDispositivo() {
    if (!navigator.geolocation) { setAviso("Este navegador no da la ubicación."); return; }
    setAviso("Buscando la ubicación… (acepta el permiso si lo pide)");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude.toFixed(6)); setLon(p.coords.longitude.toFixed(6));
        setAviso(`Ubicación de este dispositivo (precisión de unos ${Math.round(p.coords.accuracy)} m). Úsala estando dentro de la tienda.`);
      },
      () => setAviso("No se pudo obtener la ubicación. Revisa el permiso de ubicación del navegador o pega un enlace de Google Maps."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <details className="ubicacion">
      <summary>
        Ubicación{" "}
        <span className="quieto pequeno">{geo.activa && geo.latitud != null ? `· activa, ${geo.radio_m} m` : geo.latitud != null ? "· guardada, sin usar" : "· sin configurar"}</span>
      </summary>
      <form action={guardarUbicacion} className="ubicacion-cuerpo">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="sucursal" value={sucursal} />
        <p className="quieto pequeno" style={{ marginTop: 0 }}>
          Para la consulta desde el celular de los clientes: solo funciona a menos de esta distancia de «{nombre}».
        </p>
        <div className="fila">
          <button className="boton secundario" type="button" onClick={desdeDispositivo}>Usar la ubicación de este dispositivo</button>
          <div className="campo" style={{ marginBottom: 0, flex: "2 1 260px" }}>
            <label htmlFor={`maps-${sucursal}`}>o pega un enlace de Google Maps</label>
            <input id={`maps-${sucursal}`} value={enlace} onChange={(e) => desdeEnlace(e.target.value)} placeholder="https://www.google.com/maps/place/…" autoComplete="off" />
          </div>
        </div>
        {aviso && <p className="quieto pequeno" role="status" style={{ margin: "8px 0 0" }}>{aviso}</p>}
        <div className="fila" style={{ marginTop: 12 }}>
          <div className="campo" style={{ marginBottom: 0 }}>
            <label htmlFor={`lat-${sucursal}`}>Latitud</label>
            <input id={`lat-${sucursal}`} name="latitud" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="18.486100" />
          </div>
          <div className="campo" style={{ marginBottom: 0 }}>
            <label htmlFor={`lon-${sucursal}`}>Longitud</label>
            <input id={`lon-${sucursal}`} name="longitud" inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="-69.931200" />
          </div>
          <div className="campo" style={{ marginBottom: 0 }}>
            <label htmlFor={`radio-${sucursal}`}>Distancia</label>
            <select id={`radio-${sucursal}`} name="radio_m" value={radio} onChange={(e) => setRadio(Number(e.target.value))}>
              {[...new Set([...RADIOS, radio])].sort((a, b) => a - b).map((r) => <option key={r} value={r}>{r} m</option>)}
            </select>
          </div>
        </div>
        <label className="opcion-linea">
          <input type="checkbox" name="geo_activa" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
          Exigir estar cerca de la sucursal para consultar desde el celular
        </label>
        {punto ? (
          <figure className="ubicacion-mapa">
            <iframe title={`Mapa de ${nombre}`} src={mapaEmbebido(punto, radio)} loading="lazy" />
            <figcaption className="pequeno"><a href={enlaceGoogleMaps(punto)} target="_blank" rel="noopener noreferrer">Ver en Google Maps</a></figcaption>
          </figure>
        ) : (lat || lon) ? <p className="error-campo">Latitud o longitud no válidas.</p> : null}
        <div className="fila" style={{ marginTop: 12 }}>
          <button className="boton" type="submit" disabled={(Boolean(lat || lon) && !punto) || (activa && !punto)}>Guardar ubicación</button>
          {activa && !punto && <span className="error-campo" style={{ margin: 0 }}>Para activarla falta la ubicación.</span>}
        </div>
      </form>
    </details>
  );
}
