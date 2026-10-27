import Link from "next/link";
import { redirect } from "next/navigation";
import { Barra } from "@/components/Barra";
import { Aviso } from "@/components/Aviso";
import { supabaseServidor } from "@/lib/supabase/server";
import { ROLES } from "@/lib/util";

export const metadata = { title: "Tus negocios" };

type Fila = { rol: string; negocios: { id: string; nombre: string; slug: string; plan: string } | null };
type Props = { searchParams: Promise<{ bien?: string }> };

export default async function Negocios({ searchParams }: Props) {
  const { bien } = await searchParams;
  const supabase = await supabaseServidor();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/entrar");
  const { data } = await supabase
    .from("miembros")
    .select("rol, negocios(id, nombre, slug, plan)")
    .eq("user_id", auth.user.id)
    .order("creado", { ascending: true });
  const filas = ((data ?? []) as unknown as Fila[]).filter((f) => f.negocios);
  const { data: plataforma } = await supabase.rpc("es_plataforma");
  // Cuenta de la plataforma: directo a su panel de negocios y licencias (no hace falta esta pantalla).
  if (plataforma && !bien) redirect("/plataforma");
  // Un solo negocio (lo normal): directo a su panel.
  if (filas.length === 1 && !plataforma && !bien) redirect(`/n/${filas[0].negocios!.slug}`);
  return (
    <>
      <Barra />
      <main className="contenido">
        <Aviso bien={bien} />
        <h1>Tus negocios</h1>
        {filas.length === 0 ? (
          <div className="tarjeta">
            <h2>Tu cuenta todavía no tiene negocios</h2>
            <p className="quieto">
              {plataforma ? "Da de alta el primero en la Plataforma." : "Pide a quien administra Prezio en tu negocio que te dé acceso."}
            </p>
            {plataforma && <Link className="boton" href="/plataforma">Ir a la Plataforma</Link>}
          </div>
        ) : (
          <>
            <div className="rejilla">
              {filas.map((f) => (
                <Link key={f.negocios!.id} className="negocio-enlace" href={`/n/${f.negocios!.slug}`}>
                  <div className="tarjeta">
                    <h2>{f.negocios!.nombre}</h2>
                    <span className="chip">{ROLES[f.rol] ?? f.rol}</span>
                  </div>
                </Link>
              ))}
            </div>
            {plataforma && (
              <p style={{ marginTop: 24 }}>
                <Link className="boton secundario" href="/plataforma">Plataforma: dar de alta negocios</Link>
              </p>
            )}
          </>
        )}
      </main>
    </>
  );
}
