-- =====================================================================
-- Prezcio · 0016 · La dirección pasa a https://prezcio.app. Ejecutar DESPUÉS de 0015. Idempotente.
-- La tarea programada de Google Drive llama a la dirección guardada aquí. prezio-jade.vercel.app sigue
-- funcionando (lo que ya está instalado o impreso no se rompe), pero lo nuevo usa la dirección propia.
-- =====================================================================
update public.ajustes_privados set valor = 'https://prezcio.app'
where clave = 'sitio' and valor in ('https://prezio-jade.vercel.app', 'https://prezio.vercel.app');
