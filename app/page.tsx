import Link from "next/link";
import { redirect } from "next/navigation";
import { EntradaMarco } from "@/components/EntradaMarco";
import { usuarioActual } from "@/lib/supabase/server";

export default async function Inicio() {
  if (await usuarioActual()) redirect("/negocios");
  return (
    <EntradaMarco>
      <h1>Verificadores de precios para tu negocio</h1>
      <p className="quieto">
        Carga tus precios desde Excel, Google o tu sistema, y pon verificadores en cada sucursal. Funcionan aunque se
        caiga el internet.
      </p>
      <div className="fila" style={{ marginTop: 24 }}>
        <Link className="boton" href="/registro">Probar gratis 30 días</Link>
        <Link className="boton secundario" href="/entrar">Entrar</Link>
      </div>
    </EntradaMarco>
  );
}
