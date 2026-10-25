import { Sesion } from "./Sesion";

export const metadata = { title: "Entrando…", robots: { index: false } };

/** Recibe una sesión en el fragmento de la dirección (#access_token=…&refresh_token=…) y entra:
 *  - la app Prezio Administrador abre el panel con la misma sesión con la que se entró en la app;
 *  - el enlace de invitación por correo de un dueño nuevo (después elige su clave).
 *  El fragmento nunca llega al servidor ni queda en el historial. */
export default function Pagina() {
  return <Sesion />;
}
