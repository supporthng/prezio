"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icono, type NombreIcono } from "@/components/Icono";
import { Logo } from "@/components/Logo";

export type Avisos = { reprogramar: number; borradores: number; vencidas: number; bajoMinimo: number };

type Enlace = { href: string; texto: string; icono: NombreIcono; aviso?: keyof Avisos };

const GRUPOS: { titulo: string; enlaces: Enlace[] }[] = [
  {
    titulo: "Operación",
    enlaces: [
      { href: "/oficina", texto: "Inicio", icono: "inicio" },
      { href: "/oficina/rutas", texto: "Rutas", icono: "rutas" },
      { href: "/oficina/reprogramar", texto: "Por reprogramar", icono: "reprogramar", aviso: "reprogramar" },
      { href: "/oficina/clientes", texto: "Clientes", icono: "clientes" },
      { href: "/oficina/garantias", texto: "Garantías", icono: "garantias" },
    ],
  },
  {
    titulo: "Ventas y cobros",
    enlaces: [
      { href: "/oficina/venta", texto: "Venta rápida", icono: "venta" },
      { href: "/oficina/facturacion", texto: "Facturación", icono: "facturacion", aviso: "borradores" },
      { href: "/oficina/cobros", texto: "Cuentas por cobrar", icono: "cobros", aviso: "vencidas" },
    ],
  },
  {
    titulo: "Inventario",
    enlaces: [{ href: "/oficina/inventario", texto: "Productos", icono: "inventario", aviso: "bajoMinimo" }],
  },
  {
    titulo: "Empresa",
    enlaces: [
      { href: "/oficina/facturacion/reportes", texto: "Reportes DGII", icono: "reporte" },
      { href: "/oficina/importar", texto: "Importar Excel", icono: "importar" },
      { href: "/oficina/ajustes", texto: "Ajustes", icono: "ajustes" },
    ],
  },
];

const TODOS = GRUPOS.flatMap((g) => g.enlaces.map((e) => e.href));

/** El enlace activo es el de la ruta más larga que coincide */
function activoPara(ruta: string) {
  return TODOS.filter((h) => (h === "/oficina" ? ruta === "/oficina" : ruta === h || ruta.startsWith(h + "/")))
    .sort((a, b) => b.length - a.length)[0];
}

function Lista({ avisos, alNavegar }: { avisos: Avisos; alNavegar?: () => void }) {
  const ruta = usePathname();
  const activo = activoPara(ruta);
  return (
    <div className="flex flex-col gap-5">
      {GRUPOS.map((g) => (
        <div key={g.titulo} className="flex flex-col gap-0.5">
          <span className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-marca-300">{g.titulo}</span>
          {g.enlaces.map((e) => {
            const es = e.href === activo;
            const n = e.aviso ? avisos[e.aviso] : 0;
            return (
              <Link
                key={e.href}
                href={e.href}
                onClick={alNavegar}
                aria-current={es ? "page" : undefined}
                className={`flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm transition ${
                  es
                    ? "bg-white/10 font-bold text-white shadow-[inset_3px_0_0_var(--color-lima)]"
                    : "font-medium text-[#C9DCD0] hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icono nombre={e.icono} className={es ? "text-lima" : ""} />
                <span className="flex-1">{e.texto}</span>
                {n > 0 && (
                  <span
                    className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold ${
                      e.aviso === "vencidas" ? "bg-[#F08A5D] text-[#3A1200]" : "bg-[#F2B33D] text-[#3A2500]"
                    }`}
                  >
                    {n > 99 ? "99+" : n}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function Menu({ avisos, usuario }: { avisos: Avisos; usuario: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      {/* Escritorio: menú lateral fijo */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col gap-6 overflow-y-auto bg-marca-900 px-3.5 py-5 lg:flex print:hidden">
        <Link href="/oficina" className="px-2">
          <Logo claro chico />
        </Link>
        <nav aria-label="Menú principal" className="flex-1">
          <Lista avisos={avisos} />
        </nav>
        {usuario}
      </aside>

      {/* Celular y tableta: barra arriba y menú deslizable */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-marca-900 px-4 py-2.5 lg:hidden print:hidden">
        <Link href="/oficina">
          <Logo claro chico />
        </Link>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="rounded-xl p-2 text-white hover:bg-white/10"
          aria-label="Abrir el menú"
          aria-expanded={abierto}
        >
          <Icono nombre="menu" tam={22} />
        </button>
      </header>
      {abierto && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <button type="button" className="absolute inset-0 bg-marca-950/50" aria-label="Cerrar el menú" onClick={() => setAbierto(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col gap-6 overflow-y-auto bg-marca-900 px-3.5 py-5 shadow-flotante">
            <div className="flex items-center justify-between px-2">
              <Logo claro chico />
              <button type="button" onClick={() => setAbierto(false)} className="rounded-xl p-2 text-white hover:bg-white/10" aria-label="Cerrar el menú">
                <Icono nombre="cerrar" tam={20} />
              </button>
            </div>
            <nav aria-label="Menú principal" className="flex-1">
              <Lista avisos={avisos} alNavegar={() => setAbierto(false)} />
            </nav>
            {usuario}
          </div>
        </div>
      )}
    </>
  );
}
