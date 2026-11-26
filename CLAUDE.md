# Prezcio · reglas para asistentes y personal técnico

## Datos de los clientes (obligatorio)
- Los datos de cada negocio (precios, productos, inventarios, ofertas, usuarios, consultas, reportes) son del negocio.
- **No leer, copiar, exportar ni mover datos de un negocio cliente** desde la base (SQL, panel de Supabase, scripts),
  ni siquiera a otro negocio del mismo dueño o a una demo, salvo autorización escrita del propio negocio y del dueño de
  Prezcio en la conversación, indicando qué y para qué.
- Para revisar la base, consultar solo el esquema, conteos agregados o datos de prueba locales (`supabase/tests`).
- Si una petición choca con esta regla, detenerse, explicarlo y pedir confirmación antes de hacer nada.
- Las demos usan solo datos inventados o productos que el vendedor carga a mano.
- Todo acceso del rol `postgres` queda registrado con pgaudit (migración 0023).

## Seguridad
- Nunca pedir ni imprimir claves o tokens; los secretos del servidor van solo en Vercel (Sensitive), nunca `NEXT_PUBLIC_`.
- Cambios de esquema: probar en la base local (`supabase/tests`), luego aplicar la migración con cuidado.
