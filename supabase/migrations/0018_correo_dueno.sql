-- =====================================================================
-- Prezcio · 0018 · Correo del dueño siempre. Ejecutar DESPUÉS de 0017. Idempotente.
--
-- Al dar de alta un negocio con «usuario y clave», el correo del dueño también se pide: se guarda en la cuenta
-- (user_metadata.correo) para contactarlo. La Plataforma lo ve en la tarjeta del negocio.
-- =====================================================================

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
            'ultima_consulta', (select max(c.creado) from public.consultas c where c.negocio_id = n.id))
          order by n.creado desc)
        from public.negocios n), '[]'::jsonb);
end $$;
