import Link from "next/link";
import { headers } from "next/headers";
import { Marca } from "./Marca";
import { BotonSalir, MenuLateralApp, SoloWeb } from "./EnApp";
import { supabaseServidor } from "@/lib/supabase/server";

/** Barra superior del panel: logotipo, negocio actual y salir. «Cambiar de negocio» solo para quien tiene varios
 *  negocios (o la plataforma) y nunca dentro de la app Prezio Administrador, que es de un solo negocio. */
export async function Barra({ negocio }: { negocio?: { nombre: string; slug: string } }) {
  // Dentro de la app Prezio Administrador (Windows) el panel lleva su menú lateral: se decide aquí, en el servidor,
  // para que no se vea la barra de arriba un instante antes de cambiarla por el menú.
  const enAppDesdeServidor = ((await headers()).get("user-agent") ?? "").includes("PrezioAdministrador/");
  let variosNegocios = false;
  if (negocio) {
    const supabase = await supabaseServidor();
    const { data: quien } = await supabase.auth.getUser();
    if (quien.user) {
      const [{ count }, { data: plataforma }] = await Promise.all([
        supabase.from("miembros").select("negocio_id", { count: "exact", head: true }).eq("user_id", quien.user.id),
        supabase.rpc("es_plataforma"),
      ]);
      variosNegocios = (count ?? 0) > 1 || Boolean(plataforma);
    }
  }
  return (
    <>
    {negocio && enAppDesdeServidor && (
      <style>{"body{padding-left:232px}.barra,.subnav{display:none!important}"}</style>
    )}
    {negocio && <MenuLateralApp negocio={negocio} desdeServidor={enAppDesdeServidor} />}
    <header className="barra">
      <nav>
        <SoloWeb><Link href="/negocios" style={{ textDecoration: "none" }}><Marca tamano={24} /></Link></SoloWeb>
        {negocio && <span className="chip">{negocio.nombre}</span>}
      </nav>
      <nav>
        {negocio && variosNegocios && <SoloWeb><Link className="boton secundario" href="/negocios">Cambiar de negocio</Link></SoloWeb>}
        <BotonSalir />
      </nav>
    </header>
    </>
  );
}
