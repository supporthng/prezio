import Link from "next/link";
import { redirect } from "next/navigation";
import { EntradaMarco } from "@/components/EntradaMarco";
import { usuarioActual } from "@/lib/supabase/server";
import { variablesFaltantes } from "@/lib/supabase/config";

export default async function Inicio() {
  const faltan = variablesFaltantes();
  if (faltan.length) {
    return (
      <EntradaMarco>
        <h1>Falta conectar Supabase</h1>
        <p>En Vercel › tu proyecto › <strong>Settings › Environment Variables</strong>, agrega:</p>
        <ul>
          {faltan.map((v) => <li key={v}><code>{v}</code></li>)}
        </ul>
        <p className="quieto pequeno">
          Después ve a <strong>Deployments</strong>, abre el último y toca <strong>Redeploy</strong>: las variables se
          aplican al publicar.
        </p>
      </EntradaMarco>
    );
  }
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
