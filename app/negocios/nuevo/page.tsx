import { redirect } from "next/navigation";

/** Los negocios nuevos se dan de alta en la Plataforma. */
export default function NuevoNegocio() {
  redirect("/plataforma");
}
