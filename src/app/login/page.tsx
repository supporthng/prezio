import type { Metadata } from "next";
import { Icono, type NombreIcono } from "@/components/Icono";
import { Logo } from "@/components/Logo";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { FormularioLogin } from "./FormularioLogin";

export const metadata: Metadata = { title: "Entrar" };

const PUNTOS: { icono: NombreIcono; texto: string }[] = [
  { icono: "rutas", texto: "Rutas diarias, semanales y mensuales automáticas" },
  { icono: "venta", texto: "Punto de venta y facturación con NCF y e-CF" },
  { icono: "cobros", texto: "Cobros, crédito y estado de cuenta de cada cliente" },
];

export default function Login() {
  return (
    <main className="flex min-h-screen flex-col bg-stone-50 lg:flex-row">
      <section className="relative flex flex-col justify-between gap-10 overflow-hidden bg-marca-900 px-6 py-8 text-white sm:px-10 lg:w-[46%] lg:px-14 lg:py-14">
        <svg viewBox="0 0 120 120" aria-hidden="true" className="pointer-events-none absolute -right-40 -bottom-36 h-[520px] w-[520px] opacity-[0.08]">
          <path d="M30 88 C30 52 52 30 90 30 C90 68 68 90 30 90 Z" fill="#C6F05A" />
        </svg>
        <Logo claro />
        <div className="relative hidden space-y-7 lg:block">
          <h1 className="font-display text-[40px] leading-[1.15] font-semibold tracking-tight">
            Cada cliente, en su día.
            <br />
            Cada factura, cobrada.
          </h1>
          <ul className="space-y-4">
            {PUNTOS.map((p) => (
              <li key={p.texto} className="flex items-center gap-3.5">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-lima/15 text-lima">
                  <Icono nombre={p.icono} tam={20} />
                </span>
                <span className="text-[15px] text-[#D5E8DC]">{p.texto}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative hidden text-[13px] text-marca-300 lg:block">Gestión para empresas de control de plagas</p>
      </section>

      <section className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-[400px] space-y-7">
          <div>
            <h2 className="font-display text-3xl font-semibold tracking-tight">Bienvenido</h2>
            <p className="mt-1 text-[15px] text-stone-500">Entra con tu correo de la empresa.</p>
          </div>
          {supabaseConfigurado ? (
            <FormularioLogin />
          ) : (
            <div className="tarjeta space-y-2 p-5 text-sm text-stone-700">
              <p className="font-semibold text-stone-900">Falta conectar la base de datos</p>
              <p>
                Agrega las variables <code className="rounded bg-stone-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
                <code className="rounded bg-stone-100 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> en Vercel y vuelve a publicar.
                Los pasos están en el README.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
