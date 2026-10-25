-- =====================================================================
-- Prezio · 0013 · Activar la app Prezio Administrador con la licencia del negocio.
-- Ejecutar en Supabase › SQL Editor DESPUÉS de 0012. Idempotente.
--
-- La primera vez, la app pide la licencia (PREZIO-XXXX-XXXX-XXXX): con ella sabe de qué negocio es y muestra
-- su nombre. Después solo se entra con usuario y clave. Sin la licencia correcta no se activa.
-- =====================================================================

create or replace function public.licencia_info(p_licencia text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    n public.negocios;
begin
    select * into n from public.negocios where licencia = upper(btrim(coalesce(p_licencia, '')));
    if n.id is null then
        return null;
    end if;
    return jsonb_build_object('id', n.id, 'nombre', n.nombre, 'licencia', n.licencia,
        'estado', case when n.plan = 'suspendido' then 'suspendida'
                       when public.negocio_suspendido(n.id) then 'vencida'
                       when n.plan = 'prueba' then 'prueba' else 'activa' end);
end $$;

revoke all on function public.licencia_info(text) from public;
grant execute on function public.licencia_info(text) to anon, authenticated;
