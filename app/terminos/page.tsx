import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Condiciones del servicio · Prezcio" };

export default function Terminos() {
  return (
    <main className="contenido" style={{ maxWidth: 720 }}>
      <h1>Condiciones del servicio</h1>
      <p className="quieto pequeno">Última actualización: 26 de noviembre de 2026</p>

      <h2>El servicio</h2>
      <p>
        Prezcio ofrece a los comercios una herramienta para mostrar precios a sus clientes mediante verificadores y
        consulta desde el celular. El servicio se presta bajo la licencia contratada con tu proveedor de Prezcio.
      </p>

      <h2>Tu responsabilidad</h2>
      <p>
        Eres responsable de que los precios y productos que cargas sean correctos, de la seguridad de tus claves de
        acceso y de tener derecho a usar los archivos y bases de datos que conectas.
      </p>

      <h2>Tus datos son tuyos</h2>
      <p>
        Los precios, productos, inventarios, ofertas, usuarios y reportes que cargas en Prezcio pertenecen a tu negocio.
        Prezcio los usa solo para prestarte el servicio: no los vende, no los comparte con otros clientes y nunca los
        usa en demostraciones, ventas ni en la cuenta de otro negocio.
      </p>

      <h2>Quién puede ver tu información</h2>
      <p>
        Cada negocio está aislado: ningún otro cliente puede ver tus datos, y el equipo de Prezcio tampoco los ve desde su
        plataforma de administración, que solo muestra tu licencia, tus pagos y cantidades (sucursales, equipos, usuarios
        y productos).
      </p>
      <p>
        El acceso técnico a la base de datos está reservado a un único administrador autorizado y solo se usa para:
      </p>
      <ul>
        <li>restablecer el servicio ante una falla;</li>
        <li>atender una solicitud de soporte que tú hagas por escrito (WhatsApp o correo), indicando qué se puede revisar;</li>
        <li>cumplir una orden de una autoridad competente.</li>
      </ul>
      <p>
        Cada acceso técnico queda registrado y, salvo orden legal en contrario, te informamos qué se revisó y por qué.
      </p>

      <h2>Seguridad</h2>
      <p>
        Toda la comunicación viaja cifrada. Cada persona entra con su propio usuario y clave, con permisos por sucursal,
        y las apps piden credenciales al abrirse. La administración de Prezcio exige verificación en dos pasos. Las claves
        de tus bases de datos se guardan cifradas en tu propio equipo y nunca se envían a Prezcio. Si detectamos un
        acceso no autorizado a tus datos, te avisaremos sin demora con lo que sepamos y lo que estamos haciendo.
      </p>

      <h2>Respaldo y eliminación</h2>
      <p>
        Puedes descargar un respaldo de tu información desde el panel cuando quieras. Si terminas el servicio y pides
        eliminar tu negocio, se borran de forma permanente sus sucursales, productos, ofertas, usuarios, equipos y pagos;
        las copias de seguridad automáticas del proveedor de alojamiento se eliminan en su ciclo normal.
      </p>

      <h2>Disponibilidad</h2>
      <p>
        Trabajamos para que el servicio esté siempre disponible, pero no garantizamos que funcione sin interrupciones.
        Prezcio no se hace responsable de pérdidas causadas por precios mal cargados o por falta temporal del servicio.
      </p>

      <h2>Licencia y pagos</h2>
      <p>
        El uso de Prezcio requiere una licencia vigente. Si vence o se suspende, podrás ver tus datos, pero no cambiarlos,
        y los verificadores dejarán de mostrar precios.
      </p>

      <h2>Cambios</h2>
      <p>Podemos actualizar estas condiciones. Los cambios importantes se avisarán en el panel.</p>

      <p style={{ marginTop: 28 }}><Link href="/privacidad">Política de privacidad</Link> · <Link href="/">‹ Volver a Prezcio</Link></p>
    </main>
  );
}
