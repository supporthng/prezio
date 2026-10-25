import Link from "next/link";
import { EntradaMarco } from "@/components/EntradaMarco";

export default function NoEncontrado() {
  return (
    <EntradaMarco>
      <h1>No encontramos esta página</h1>
      <p className="quieto">Puede que no exista o que tu cuenta no tenga acceso a ese negocio.</p>
      <Link className="boton" href="/negocios">Ir a tus negocios</Link>
    </EntradaMarco>
  );
}
