-- Eliminar un negocio desde la Plataforma (solo administrador, con sesión verificada en 2 pasos).
-- Todo lo del negocio se borra en cascada; queda una constancia en plataforma_bajas.

create table if not exists public.plataforma_bajas (
    id bigserial primary key,
    negocio_id uuid not null,
    nombre text not null,
    slug text not null,
    licencia text,
    plan text,
    detalle jsonb not null default '{}'::jsonb,
    por uuid references auth.users(id) on delete set null,
    creado timestamptz not null default now()
);
alter table public.plataforma_bajas enable row level security;
drop policy if exists plataforma_bajas_ver on public.plataforma_bajas;
create policy plataforma_bajas_ver on public.plataforma_bajas for select to authenticated using (public.plataforma_es_admin());
revoke all on public.plataforma_bajas from anon;
revoke insert, update, delete on public.plataforma_bajas from authenticated;
grant select on public.plataforma_bajas to authenticated;

-- Devuelve lo que la app debe limpiar fuera de la base: archivos, subdominio y cuentas «usuario» huérfanas.
create or replace function public.plataforma_eliminar_negocio(p_negocio uuid, p_confirmacion text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    n public.negocios%rowtype;
    huerfanas uuid[];
begin
    if not public.plataforma_es_admin() then
        raise exception 'Solo un administrador de la plataforma puede eliminar negocios' using errcode = '42501';
    end if;
    select * into n from public.negocios where id = p_negocio for update;
    if not found then
        raise exception 'Ese negocio no existe' using errcode = '22023';
    end if;
    if lower(btrim(coalesce(p_confirmacion, ''))) <> lower(btrim(n.nombre)) then
        raise exception 'Escribe el nombre exacto del negocio para confirmar' using errcode = '22023';
    end if;
    -- Cuentas sin correo (usuario + clave) que solo pertenecen a este negocio: se borran después en Auth.
    select coalesce(array_agg(m.user_id), '{}') into huerfanas
    from public.miembros m join auth.users u on u.id = m.user_id
    where m.negocio_id = n.id and u.email like '%.prezio.invalid'
      and not exists (select 1 from public.miembros o where o.user_id = m.user_id and o.negocio_id <> n.id)
      and not exists (select 1 from public.plataforma_admins a where a.user_id = m.user_id);
    insert into public.plataforma_bajas (negocio_id, nombre, slug, licencia, plan, detalle, por)
    values (n.id, n.nombre, n.slug, n.licencia, n.plan,
            jsonb_build_object(
                'sucursales', (select count(*) from public.sucursales s where s.negocio_id = n.id),
                'equipos', (select count(*) from public.equipos e where e.negocio_id = n.id),
                'usuarios', (select count(*) from public.miembros m where m.negocio_id = n.id),
                'productos', (select count(*) from public.productos p where p.negocio_id = n.id)),
            auth.uid());
    delete from public.negocios where id = n.id;
    return jsonb_build_object('id', n.id, 'slug', n.slug, 'nombre', n.nombre, 'cuentas', to_jsonb(huerfanas));
end $$;
revoke all on function public.plataforma_eliminar_negocio(uuid, text) from public, anon, authenticated;
grant execute on function public.plataforma_eliminar_negocio(uuid, text) to authenticated;
