-- =====================================================================
-- Prezcio · 0020 · Consulta desde el celular como servicio adicional. Ejecutar DESPUÉS de 0019. Idempotente.
--
-- La activa la Plataforma para el negocio que la paga (negocios.movil_contratada). Sin contratarla, el dueño no
-- puede encenderla, y al quitarla se apaga sola. Al aplicar esta migración queda apagada en todos los negocios.
-- =====================================================================

alter table public.negocios add column if not exists movil_contratada boolean not null default false;

create or replace function public.negocios_movil()
returns trigger language plpgsql set search_path = '' as $$
begin
    -- Solo la Plataforma (sus funciones) cambia si está contratada; una cuenta por la API, no.
    if new.movil_contratada is distinct from old.movil_contratada and current_user in ('authenticated', 'anon') then
        raise exception 'La consulta desde el celular la activa tu proveedor de Prezcio' using errcode = '42501';
    end if;
    if new.consulta_movil and not new.movil_contratada then
        if not coalesce(old.consulta_movil, false) and current_user in ('authenticated', 'anon') then
            raise exception 'La consulta desde el celular es un servicio adicional: pídela a tu proveedor de Prezcio' using errcode = '42501';
        end if;
        new.consulta_movil := false;
    end if;
    return new;
end $$;

drop trigger if exists negocios_movil on public.negocios;
create trigger negocios_movil before update on public.negocios for each row execute function public.negocios_movil();

update public.negocios set consulta_movil = false where consulta_movil;

create or replace function public.plataforma_movil(p_negocio uuid, p_activa boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
    if not public.plataforma_escribe() then
        raise exception 'Solo la plataforma' using errcode = '42501';
    end if;
    update public.negocios set movil_contratada = coalesce(p_activa, false) where id = p_negocio;
    if not found then
        raise exception 'Ese negocio no existe' using errcode = '22023';
    end if;
    perform public.anotar_evento(p_negocio, case when p_activa then 'movil_activada' else 'movil_quitada' end, '{}'::jsonb);
end $$;

revoke all on function public.plataforma_movil(uuid, boolean) from public, anon, authenticated;
grant execute on function public.plataforma_movil(uuid, boolean) to authenticated;
revoke all on function public.negocios_movil() from public, anon, authenticated;

create or replace function public.plataforma_negocios()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
    if not public.es_plataforma() then
        raise exception 'Solo la plataforma' using errcode = '42501';
    end if;
    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', n.id, 'nombre', n.nombre, 'slug', n.slug, 'plan', n.plan, 'moneda', n.moneda, 'creado', n.creado,
            'licencia', n.licencia, 'prueba_hasta', n.prueba_hasta, 'pagado_hasta', n.pagado_hasta,
            'bloqueado', public.negocio_suspendido(n.id),
            'lic', public.licencia_estado(n.id),
            'limites', public.limites_negocio(n.id),
            'pcs', (select count(*) from public.licencia_pcs c where c.negocio_id = n.id and c.liberada is null),
            'solicitud', (select s.estado from public.solicitudes_plan s where s.negocio_id = n.id and s.estado in ('nueva', 'contactada') limit 1),
            'duenos', coalesce((select jsonb_agg(jsonb_build_object(
                                    'usuario', m.usuario,
                                    'correo', case when u.email like '%.prezio.invalid' then nullif(u.raw_user_meta_data ->> 'correo', '') else u.email end,
                                    'confirmado', u.email_confirmed_at is not null or u.email like '%.prezio.invalid'))
                                from public.miembros m join auth.users u on u.id = m.user_id
                                where m.negocio_id = n.id and m.rol = 'dueno'), '[]'::jsonb),
            'usuarios', (select count(*) from public.miembros m where m.negocio_id = n.id),
            'sucursales', (select count(*) from public.sucursales s where s.negocio_id = n.id),
            'equipos', (select count(*) from public.equipos e where e.negocio_id = n.id),
            'equipos_activos', (select count(*) from public.equipos e where e.negocio_id = n.id and e.visto > now() - interval '1 day'),
            'productos', (select count(*) from public.productos p where p.negocio_id = n.id),
            'movil', jsonb_build_object('contratada', n.movil_contratada, 'activa', n.consulta_movil),
            'ultima_consulta', (select max(c.creado) from public.consultas c where c.negocio_id = n.id))
          order by n.creado desc)
        from public.negocios n), '[]'::jsonb);
end $$;
