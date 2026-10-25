import { NOMBRE_PERMISO, PERMISOS, type Permiso } from "@/lib/permisos";

type Props = {
  id: string;
  marcados: string[];
  alcance: string[] | null;                    // null = todas las sucursales
  sucursales: { id: string; nombre: string }[];
  puedoDar: string[];                          // casillas que quien edita puede dar
  soloAlgunas: boolean;                        // quien edita solo tiene algunas sucursales
  misSucursales: string[] | null;
};

/** Casillas de permisos + en qué sucursales aplican. Funciona sin JavaScript (formulario normal). */
export function Casillas({ id, marcados, alcance, sucursales, puedoDar, soloAlgunas, misSucursales }: Props) {
  const algunas = soloAlgunas || alcance !== null;
  return (
    <>
      <fieldset className="casillas">
        <legend>Puede</legend>
        {PERMISOS.map((p: Permiso) => {
          const libre = puedoDar.includes(p);
          return (
            <label key={p} className={`casilla${libre ? "" : " bloqueada"}`}>
              <input type="checkbox" name="permiso" value={p} defaultChecked={marcados.includes(p)} disabled={!libre} />
              <span><strong>{NOMBRE_PERMISO[p].nombre}</strong><span className="quieto pequeno">{NOMBRE_PERMISO[p].detalle}</span></span>
              {/* Una casilla que no puede dar, pero la persona ya tiene, se conserva tal cual. */}
              {!libre && marcados.includes(p) && <input type="hidden" name="permiso" value={p} />}
            </label>
          );
        })}
        <p className="quieto pequeno" style={{ margin: "4px 0 0" }}>Sin casillas: solo puede usar el verificador en línea.</p>
      </fieldset>
      <fieldset className="casillas">
        <legend>En qué sucursales</legend>
        {!soloAlgunas && (
          <label className="casilla-linea"><input type="radio" name="alcance" value="todas" defaultChecked={!algunas} /> Todas (también las nuevas)</label>
        )}
        <label className="casilla-linea"><input type="radio" name="alcance" value="algunas" defaultChecked={algunas} /> Solo estas:</label>
        <div className="casillas-sucursales">
          {sucursales.filter((s) => misSucursales === null || misSucursales.includes(s.id)).map((s) => (
            <label key={s.id} className="casilla-linea">
              <input type="checkbox" name="sucursal" value={s.id} defaultChecked={alcance?.includes(s.id) ?? false} id={`${id}-${s.id}`} /> {s.nombre}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}
