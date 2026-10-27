import type { Metadata } from "next";
import { Encabezado } from "@/components/Encabezado";
import { SelectorFacturar } from "@/components/SelectorFacturar";
import { hoyRD } from "@/lib/formato";
import { datosEditor } from "../datos";
import { Editor } from "../Editor";

export const metadata: Metadata = { title: "Nueva factura" };

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function NuevaFactura({ searchParams }: PageProps<"/oficina/facturacion/nueva">) {
  const sp = await searchParams;
  const tipo = uno(sp.tipo) === "proforma" ? "proforma" : "factura";
  const d = await datosEditor();
  const cliente = d.clientes.find((c) => c.id === uno(sp.cliente)) ?? null;

  return (
    <div className="space-y-4">
      <Encabezado
        titulo={tipo === "proforma" ? "Nueva proforma" : "Nueva factura"}
        detalle="Para servicios a crédito, varias sucursales o con detalle. Para cobrar en el momento usa la venta rápida."
        volver={{ href: "/oficina/facturacion", texto: "Facturación" }}
        acciones={<SelectorFacturar activo="factura" />}
      />
      <Editor
        {...d}
        inicial={{
          id: null,
          tipo_doc: tipo,
          tipo_ncf: tipo === "factura" && cliente ? (cliente.tipo_comprobante ?? (cliente.rnc?.trim() ? "B01" : "B02")) : null,
          cliente_id: cliente?.id ?? "",
          fecha: hoyRD(),
          dias_credito: cliente?.dias_credito ?? 0,
          notas: null,
          referencia_id: null,
          referencia_ncf: null,
          lineas: [],
        }}
      />
    </div>
  );
}
