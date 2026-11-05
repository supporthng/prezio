import { Barra } from "@/components/Barra";
import { Aviso } from "@/components/Aviso";
import { SubNav } from "@/components/SubNav";
import { CodigoNegocio } from "@/components/CodigoNegocio";
import { cargarNegocio } from "@/lib/negocio";
import { fechaCorta, textoLicencia, type EstadoLic, type Limites, type Plan } from "@/lib/licencia";
import { PedirPlan } from "./PedirPlan";
import { cancelarSolicitud } from "./actions";

export const metadata = { title: "Licencia" };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ bien?: string; error?: string }> };
type Detalle = EstadoLic & {
  limites: Limites; uso: Record<keyof Limites, number>; puede_pedir: boolean;
  contacto: { nombre?: string; telefono?: string; whatsapp?: string; correo?: string; horario?: string };
  plazo_horas: number; descuento_anual: number; moneda: string; planes: Plan[];
  solicitud: { id: string; plan: string; plan_nombre: string; meses: number; estado: string; creado: string } | null;
  respuesta: string | null;
  pcs: { nombre: string | null; version: string | null; activada: string; visto: string }[];
};

const RECURSOS: { clave: keyof Limites; nombre: string }[] = [
  { clave: "sucursales", nombre: "Sucursales" }, { clave: "equipos", nombre: "Verificadores" },
  { clave: "usuarios", nombre: "Usuarios" }, { clave: "pcs", nombre: "PCs con Prezcio Administrador" },
];
const meses = (m: number) => (m === 0 ? "pago único" : m % 12 === 0 ? `${m / 12} ${m === 12 ? "año" : "años"}` : `${m} ${m === 1 ? "mes" : "meses"}`);

export default async function Licencia({ params, searchParams }: Props) {
  const { slug } = await params;
  const { bien, error } = await searchParams;
  const { supabase, negocio } = await cargarNegocio(slug, `/n/${slug}/licencia`);
  const { data } = await supabase.rpc("licencia_detalle", { p_negocio: negocio.id });
  const d = data as Detalle;
  const abierta = d.solicitud && ["nueva", "contactada"].includes(d.solicitud.estado);
  const wa = d.contacto.whatsapp?.replace(/\D/g, "");

  return (
    <>
      <Barra negocio={{ nombre: negocio.nombre, slug: negocio.slug }} />
      <main className="contenido">
        <Aviso error={error} bien={bien} />
        <h1>Licencia</h1>
        <SubNav slug={negocio.slug} activa="licencia" />

        <section className={`tarjeta lic-estado ${d.estado}`}>
          <div>
            <p className="quieto pequeno">Plan</p>
            <h2>{d.plan_nombre}</h2>
            <p className="lic-vigencia">{textoLicencia(d)}</p>
            {d.estado === "gracia" && <p className="pequeno">Pasados los días de gracia, el panel queda en solo lectura y los verificadores dejan de mostrar precios.</p>}
          </div>
          <CodigoNegocio codigo={d.licencia ?? negocio.licencia} />
        </section>

        <section className="tarjeta">
          <h2>Lo que usa tu negocio</h2>
          <ul className="lic-uso">
            {RECURSOS.map(({ clave, nombre }) => {
              const lim = d.limites[clave], uso = d.uso[clave] ?? 0;
              const pct = lim ? Math.min(100, Math.round((uso / lim) * 100)) : 0;
              return (
                <li key={clave}>
                  <div><span>{nombre}</span><b>{uso}{lim !== null ? <small> de {lim}</small> : <small> · sin límite</small>}</b></div>
                  {lim !== null && <div className={`lic-barra${pct >= 100 ? " lleno" : pct >= 80 ? " casi" : ""}`} role="img" aria-label={`${uso} de ${lim}`}><i style={{ width: `${Math.max(pct, 4)}%` }} /></div>}
                </li>
              );
            })}
          </ul>
          {d.pcs.length > 0 && (
            <p className="quieto pequeno">Prezcio Administrador está activo en: {d.pcs.map((p) => p.nombre ?? "una PC").join(", ")}. Para usarlo en otra PC, pide a tu proveedor que libere una.</p>
          )}
        </section>

        <section className="tarjeta">
          <h2>{abierta ? "Tu solicitud" : d.bloqueado || d.estado === "gracia" ? "Renueva tu licencia" : "Cambiar o renovar el plan"}</h2>
          {abierta ? (
            <div className="lic-solicitud">
              <p>
                Pediste <strong>{d.solicitud!.plan_nombre}</strong> ({meses(d.solicitud!.meses)}) el {fechaCorta(d.solicitud!.creado)}.{" "}
                {d.solicitud!.estado === "contactada" ? "Tu proveedor ya se comunicó contigo: el plan se activa cuando confirme el pago."
                  : `Tu proveedor te contacta en menos de ${d.plazo_horas} horas.`}
              </p>
              {d.puede_pedir && (
                <form action={cancelarSolicitud}>
                  <input type="hidden" name="slug" value={negocio.slug} />
                  <input type="hidden" name="negocio" value={negocio.id} />
                  <button className="boton secundario" type="submit">Cancelar la solicitud</button>
                </form>
              )}
            </div>
          ) : (
            <>
              {d.solicitud?.estado === "rechazada" && (
                <p className="aviso error">Tu proveedor no aprobó la solicitud de {d.solicitud.plan_nombre}{d.respuesta ? `: ${d.respuesta}` : "."}</p>
              )}
              {d.planes.length === 0 ? (
                <p className="quieto">Tu proveedor todavía no publicó planes. Escríbele con los datos de abajo.</p>
              ) : d.puede_pedir ? (
                <PedirPlan planes={d.planes} actual={d.plan === "suspendido" ? d.plan_antes ?? "" : d.plan} negocio={negocio.id} slug={negocio.slug}
                  moneda={d.moneda} descuento={d.descuento_anual} plazo={d.plazo_horas} />
              ) : (
                <p className="quieto">Solo el dueño (o quien administra los usuarios) puede pedir un plan.</p>
              )}
            </>
          )}
        </section>

        {Object.keys(d.contacto).length > 0 && (
          <section className="tarjeta lic-contacto">
            <h2>Tu proveedor</h2>
            <ul>
              {d.contacto.nombre && <li><span>Nombre</span><b>{d.contacto.nombre}</b></li>}
              {d.contacto.telefono && <li><span>Teléfono</span><a href={`tel:${d.contacto.telefono.replace(/[^\d+]/g, "")}`}>{d.contacto.telefono}</a></li>}
              {d.contacto.whatsapp && <li><span>WhatsApp</span><a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hola, soy de ${negocio.nombre} (licencia ${d.licencia}).`)}`} target="_blank" rel="noreferrer">{d.contacto.whatsapp}</a></li>}
              {d.contacto.correo && <li><span>Correo</span><a href={`mailto:${d.contacto.correo}?subject=${encodeURIComponent(`Licencia ${d.licencia}`)}`}>{d.contacto.correo}</a></li>}
              {d.contacto.horario && <li><span>Horario</span><b>{d.contacto.horario}</b></li>}
            </ul>
            <p className="quieto pequeno">Al pagar, indica tu licencia <strong>{d.licencia}</strong>.</p>
          </section>
        )}
      </main>
    </>
  );
}
