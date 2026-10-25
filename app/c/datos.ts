import { rpcAnonimo } from "@/lib/rpc";

export type InfoMovil = {
  activa: boolean;
  negocio: { nombre: string; slug?: string; moneda?: string; apariencia?: { color_marca?: string; logo?: string | null; mostrar_logo?: boolean } };
  sucursales?: { id: string; codigo: string; nombre: string; es_principal: boolean; ubicacion: boolean; radio_m: number }[];
};

/** Datos públicos del negocio para la consulta desde el celular (null = el negocio no existe). */
export async function infoMovil(slug: string, sucursal?: string): Promise<InfoMovil | null> {
  try {
    return await rpcAnonimo<InfoMovil | null>("movil_info", { p_negocio: slug, p_sucursal: sucursal ?? null });
  } catch {
    return null;
  }
}
