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
  return (
    <>
      <Barra />
      <main className="contenido">
        <Aviso bien={bien} />
        <h1>Tus negocios</h1>
        {filas.length === 0 ? (
          <div className="tarjeta">
            <h2>Crea tu primer negocio</h2>
            <p className="quieto">
              Ponle el nombre de tu supermercado, tienda o farmacia. Después agregas tus sucursales, tus precios y tus
              verificadores.
            </p>
            <Link className="boton" href="/negocios/nuevo">Crear negocio</Link>
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
            <p style={{ marginTop: 24 }}>
              <Link className="boton secundario" href="/negocios/nuevo">Crear otro negocio</Link>
            </p>
          </>
        )}
      </main>
    </>
  );
}
