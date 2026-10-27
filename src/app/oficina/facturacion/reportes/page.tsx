import type { Metadata } from "next";
import Link from "next/link";
import { monto } from "@/lib/facturacion";
import { hoyRD } from "@/lib/formato";
import { datos607, datos608 } from "@/lib/reportes-dgii";

export const metadata: Metadata = { title: "Reportes 607 y 608" };

function mesAnterior(hoy: string) {
  const [a, m] = hoy.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function Reportes({ searchParams }: PageProps<"/oficina/facturacion/reportes">) {
  const sp = await searchParams;
  const p = Array.isArray(sp.mes) ? sp.mes[0] : sp.mes;
  const mes = p && /^\d{4}-\d{2}$/.test(p) ? p : mesAnterior(hoyRD());
  const [f607, f608] = await Promise.all([datos607(mes), datos608(mes)]);

  const signo = (f: (string | number)[]) => (String(f[2]).slice(1, 3) === "04" || String(f[2]).slice(1, 3) === "34" ? -1 : 1);
  const facturado = f607.reduce((s, f) => s + signo(f) * Number(f[7]), 0);
  const itbis = f607.reduce((s, f) => s + signo(f) * Number(f[8]), 0);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/oficina/facturacion" className="text-sm text-marca-700 hover:underline">← Facturación</Link>
        <h1 className="titulo mt-1">Reportes para la DGII</h1>
        <p className="text-sm text-stone-500">
          Formatos 607 (ventas) y 608 (comprobantes anulados), con las columnas en el orden de la herramienta de la DGII.
        </p>
      </div>

      <form className="tarjeta flex flex-wrap items-end gap-3 p-4">
        <div className="space-y-1">
          <label className="etiqueta" htmlFor="mes">Período</label>
          <input id="mes" name="mes" type="month" defaultValue={mes} className="campo" />
        </div>
        <button className="boton-sec">Ver</button>
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="tarjeta space-y-3 p-4">
          <h2 className="subtitulo">607 · Ventas de bienes y servicios</h2>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm tabular-nums">
            <dt className="text-stone-500">Comprobantes</dt>
            <dd className="text-right">{f607.length}</dd>
            <dt className="text-stone-500">Monto facturado (neto de notas de crédito)</dt>
            <dd className="text-right">{monto(facturado)}</dd>
            <dt className="text-stone-500">ITBIS facturado</dt>
            <dd className="text-right">{monto(itbis)}</dd>
          </dl>
          <a href={`/oficina/facturacion/reportes/descargar?tipo=607&mes=${mes}`} className="boton inline-block">Descargar 607 (Excel)</a>
        </section>
        <section className="tarjeta space-y-3 p-4">
          <h2 className="subtitulo">608 · Comprobantes anulados</h2>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm tabular-nums">
            <dt className="text-stone-500">Comprobantes anulados en el período</dt>
            <dd className="text-right">{f608.length}</dd>
          </dl>
          <a href={`/oficina/facturacion/reportes/descargar?tipo=608&mes=${mes}`} className="boton inline-block">Descargar 608 (Excel)</a>
        </section>
      </div>

      <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-medium">Antes de enviarlo, revísalo con tu contador:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>
            La forma de pago sale de los cobros registrados (efectivo, transferencia o cheque, tarjeta, saldo a favor en
            «Otras formas»). Lo que no se ha cobrado va en «Venta a crédito».
          </li>
          <li>Las retenciones de ITBIS e ISR que te hagan tus clientes se completan a mano por ahora.</li>
          <li>Copia las filas en la herramienta de Excel de la DGII para generar el archivo .txt que se sube a la Oficina Virtual.</li>
        </ul>
      </div>
    </div>
  );
}
