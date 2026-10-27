"use client";

import { createContext, startTransition, use, useActionState, useEffect, useRef, type ReactNode } from "react";
import type { Resultado } from "@/lib/tipos";

type Accion = (previo: Resultado, datos: FormData) => Promise<Resultado>;

const Pendiente = createContext(false);

/**
 * Formulario que llama una acción del servidor y muestra el resultado.
 * No borra lo escrito si hay un error. Si `limpiar` es true, vacía los
 * campos cuando sale bien.
 */
export function Formulario({
  accion,
  children,
  className,
  limpiar = false,
  confirmar,
  alGuardar,
}: {
  accion: Accion;
  children: ReactNode;
  className?: string;
  limpiar?: boolean;
  confirmar?: string;
  alGuardar?: () => void;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const ref = useRef<HTMLFormElement>(null);
  const atendido = useRef<Resultado>(null);
  const alGuardarRef = useRef(alGuardar);
  useEffect(() => {
    alGuardarRef.current = alGuardar;
  });

  useEffect(() => {
    // Una sola vez por cada respuesta exitosa
    if (estado?.ok && atendido.current !== estado) {
      atendido.current = estado;
      if (limpiar) ref.current?.reset();
      alGuardarRef.current?.();
    }
  }, [estado, limpiar]);

  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (pendiente) return;
        if (confirmar && !window.confirm(confirmar)) return;
        // Incluye el botón que se tocó (por ejemplo «Guardar» o «Emitir»)
        const boton = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const datos = new FormData(e.currentTarget, boton && boton.form === e.currentTarget ? boton : null);
        startTransition(() => enviar(datos));
      }}
    >
      <Pendiente value={pendiente}>{children}</Pendiente>
      {estado?.error && (
        <p role="alert" className="mt-2 basis-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {estado.error}
        </p>
      )}
      {estado?.ok && (
        <p role="status" className="mt-2 basis-full rounded-md bg-marca-50 px-3 py-2 text-sm text-marca-800">
          {estado.ok}
        </p>
      )}
    </form>
  );
}

export function BotonEnviar({
  children,
  className = "boton",
  pendiente: textoPendiente = "Guardando…",
  name,
  value,
}: {
  children: ReactNode;
  className?: string;
  pendiente?: string;
  name?: string;
  value?: string;
}) {
  const pendiente = use(Pendiente);
  return (
    <button type="submit" className={className} disabled={pendiente} name={name} value={value}>
      {pendiente ? textoPendiente : children}
    </button>
  );
}
