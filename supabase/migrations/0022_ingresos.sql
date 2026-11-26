-- Ingresos de la Plataforma: lo cobrado, lo que toca cobrar este mes y el ingreso mensual recurrente.
-- Fechas del mes en hora de República Dominicana.
create or replace function public.plataforma_ingresos()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    tz constant text := 'America/Santo_Domingo';
    ini timestamptz := date_trunc('month', now() at time zone tz) at time zone tz;
    fin timestamptz := (date_trunc('month', now() at time zone tz) + interval '1 month') at time zone tz;
    ant timestamptz := (date_trunc('month', now() at time zone tz) - interval '1 month') at time zone tz;
begin
    if not public.plataforma_escribe() then
        raise exception 'Solo administración o ventas' using errcode = '42501';
    end if;
    return jsonb_build_object(
        'cobrado', (select coalesce(sum(monto), 0) from public.licencia_pagos where creado >= ini and creado < fin),
        'pagos', (select count(*) from public.licencia_pagos where creado >= ini and creado < fin),
        'cobrado_antes', (select coalesce(sum(monto), 0) from public.licencia_pagos where creado >= ant and creado < ini),
        -- planes pagados que vencen este mes (renovaciones por cobrar)
        'por_cobrar', (select jsonb_build_object('negocios', count(*),
                           'monto', coalesce(sum(p.precio), 0))
                       from public.negocios n join public.planes p on p.codigo = n.plan
                       where not p.permanente and n.pagado_hasta >= greatest(ini, now()) and n.pagado_hasta < fin),
        -- planes pagados ya vencidos (en gracia o bloqueados)
        'atrasados', (select jsonb_build_object('negocios', count(*), 'monto', coalesce(sum(p.precio), 0))
                      from public.negocios n join public.planes p on p.codigo = n.plan
                      where not p.permanente and n.pagado_hasta < now()),
        'pruebas_terminan', (select count(*) from public.negocios n
                             where n.plan = 'prueba' and n.prueba_hasta >= now() and n.prueba_hasta < fin),
        -- ingreso mensual recurrente: planes al día, los anuales divididos entre 12
        'recurrente', (select coalesce(sum(case when p.periodo = 'anual' then p.precio / 12 else p.precio end), 0)
                       from public.negocios n join public.planes p on p.codigo = n.plan
                       where not p.permanente and n.pagado_hasta >= now()),
        'clientes_pagando', (select count(*) from public.negocios n join public.planes p on p.codigo = n.plan
                             where n.pagado_hasta >= now() or p.permanente),
        'ultimos', coalesce((select jsonb_agg(x order by x.creado desc) from (
                       select l.creado, l.monto, l.meses, n.nombre, coalesce(p.nombre, l.plan) as plan
                       from public.licencia_pagos l join public.negocios n on n.id = l.negocio_id
                       left join public.planes p on p.codigo = l.plan
                       order by l.creado desc limit 8) x), '[]'::jsonb)
    );
end $$;
revoke all on function public.plataforma_ingresos() from public, anon, authenticated;
grant execute on function public.plataforma_ingresos() to authenticated;
