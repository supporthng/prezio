-- =====================================================================
-- Prezcio · 0019 · Seguridad. Ejecutar DESPUÉS de 0018. Idempotente.
--
-- 1. La Plataforma exige verificación en dos pasos: sus funciones solo responden con una sesión «aal2»
--    (correo + clave + código de la app de autenticación). Con solo la clave, la cuenta no es de la Plataforma.
-- 2. plataforma_miembro(): dice si la cuenta es de la Plataforma aunque falte el código (para pedirlo).
-- 3. Imágenes: el almacén ya no acepta SVG (puede llevar código).
-- 4. crear_perfil() (función de disparador) no se puede llamar desde fuera.
-- =====================================================================

create or replace function public.sesion_fuerte()
returns boolean language sql stable set search_path = '' as $$
    select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;

create or replace function public.es_plataforma()
returns boolean language sql stable security definer set search_path = '' as $$
    select public.sesion_fuerte() and exists (select 1 from public.plataforma_admins where user_id = auth.uid())
$$;

create or replace function public.plataforma_rol()
returns text language sql stable security definer set search_path = '' as $$
    select rol from public.plataforma_admins where user_id = auth.uid() and public.sesion_fuerte()
$$;

create or replace function public.plataforma_miembro()
returns jsonb language sql stable security definer set search_path = '' as $$
    select jsonb_build_object('rol', a.rol, 'verificado', public.sesion_fuerte())
    from public.plataforma_admins a where a.user_id = auth.uid()
$$;

revoke all on function public.sesion_fuerte(), public.plataforma_miembro() from public, anon, authenticated;
grant execute on function public.sesion_fuerte(), public.plataforma_miembro() to authenticated;

update storage.buckets set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'] where id = 'marcas';

revoke all on function public.crear_perfil() from public, anon, authenticated;
