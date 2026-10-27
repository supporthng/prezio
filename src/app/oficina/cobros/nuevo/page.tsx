import type { Metadata } from "next";
import { Encabezado } from "@/components/Encabezado";
import { hoyRD } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import type { ClienteCuenta, FacturaCobro } from "@/lib/tipos";
import { FormularioCobro, type ClienteCobro } from "../FormularioCobro";

export const metadata: Metadata = { title: "Registrar cobro" };

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function NuevoCobro({ searchParams }: PageProps<"/oficina/cobros/nuevo">) {
  const sp = await searchParams;
  const supabase = await supabaseServidor();
  const [{ data: cuentas }, { data: facturas }] = await Promise.all([
    supabase.from("clientes_cuenta").select("id, nombre, rnc, saldo_favor, pendiente").order("nombre").limit(5000),
    supabase.from("facturas_cobro").select("*").gt("saldo", 0).order("fecha").limit(5000),
  ]);
  const clientes = ((cuentas ?? []) as ClienteCuenta[]).map(
    (c): ClienteCobro => ({ id: c.id, nombre: c.nombre, rnc: c.rnc, saldo_favor: Number(c.saldo_favor), pendiente: Number(c.pendiente) }),
  );
  const lista = (facturas ?? []) as FacturaCobro[];
  let cliente = uno(sp.cliente) ?? "";
  const factura = uno(sp.factura) ?? null;
  if (factura && !cliente) cliente = lista.find((f) => f.id === factura)?.cliente_id ?? "";

  return (
    <div className="space-y-5">
      <Encabezado
        titulo="Registrar cobro"
        detalle="Puedes cobrar varias facturas a la vez y combinar formas de pago. Lo que sobre queda como saldo a favor."
        volver={{ href: "/oficina/cobros", texto: "Cuentas por cobrar" }}
      />
      <FormularioCobro clientes={clientes} facturas={lista} inicialCliente={cliente} inicialFactura={factura} hoy={hoyRD()} />
    </div>
  );
}
