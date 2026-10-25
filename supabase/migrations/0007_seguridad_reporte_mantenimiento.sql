-- =====================================================================
-- Prezio · 0007 · Límite de intentos de código, reporte de consultas y limpieza automática
-- Ejecutar en Supabase › SQL Editor DESPUÉS de 0001–0006. Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------- 1. límite de intentos al vincular con código
-- Un código de 8 cifras se podría adivinar probando muchos. Ahora: máximo 10 intentos fallidos por usuario
-- cada 15 minutos. El fallo devuelve NULL (no un error) para que el intento quede anotado.
create table if not exists public.intentos_codigo (
    user_id uuid not null,
    creado timestamptz not null default now()
);
create index if not exists intentos_codigo_usuario_idx on public.intentos_codigo (user_id, creado desc);
alter table public.intentos_codigo enable row level security;
revoke all on public.intentos_codigo from anon, authenticated;

create or replace function public.vincular_equipo(p_codigo text, p_sucursal uuid, p_nombre text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    v_vinculo public.vinculos;
    v_negocio uuid;
    v_id uuid;
    v_codigo text := regexp_replace(coalesce(p_codigo, ''), '[^0-9]', '', 'g');
begin
    select negocio_id into v_negocio from public.sucursales where id = p_sucursal;
    if v_negocio is null or not (public.administra(v_negocio) or public.encarga(v_negocio, p_sucursal)) then
        raise exception 'No puedes agregar equipos a esta sucursal' using errcode = '42501';
    end if;
    if (select count(*) from public.intentos_codigo
        where user_id = auth.uid() and creado > now() - interval '15 minutes') >= 10 then
        raise exception 'Demasiados códigos equivocados. Espera 15 minutos y vuelve a intentar.' using errcode = '54000';
    end if;
    delete from public.vinculos where codigo = v_codigo and expira > now() returning * into v_vinculo;
    if v_vinculo.codigo is null then
        insert into public.intentos_codigo (user_id) values (auth.uid());
        return null;   -- código no válido o vencido (la app lo explica)
    end if;
    insert into public.equipos (negocio_id, sucursal_id, nombre, huella, creado_por)
    values (v_negocio, p_sucursal,
            coalesce(nullif(left(btrim(coalesce(p_nombre, '')), 60), ''),
                     'Equipo ' || (select count(*) + 1 from public.equipos where negocio_id = v_negocio)),
            v_vinculo.huella, auth.uid())
    returning id into v_id;
    return v_id;
end $$;

-- ---------------------------------------------------------------- 2. reporte de consultas
-- Totales, por día, lo más buscado y los códigos que NO se encontraron (productos sin precio que la gente buscó).
-- Dueño y admin ven todo el negocio (o una sucursal); el encargado, solo su sucursal.
create index if not exists consultas_negocio_sucursal_fecha_idx on public.consultas (negocio_id, sucursal_id, creado desc);

create or replace function public.resumen_consultas(p_negocio uuid, p_dias integer default 7, p_sucursal uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    v_sucursal uuid := p_sucursal;
    v_desde timestamptz := date_trunc('day', now()) - make_interval(days => least(greatest(coalesce(p_dias, 7), 1), 400) - 1);
    v jsonb;
begin
    if not public.administra(p_negocio) then
        select m.sucursal_id into v_sucursal from public.miembros m
        where m.negocio_id = p_negocio and m.user_id = auth.uid() and m.rol = 'encargado';
        if v_sucursal is null then
            raise exception 'No tienes acceso a los reportes de este negocio' using errcode = '42501';
        end if;
    end if;
    with c as (
        select * from public.consultas
        where negocio_id = p_negocio and creado >= v_desde and (v_sucursal is null or sucursal_id = v_sucursal)
    )
    select jsonb_build_object(
        'desde', v_desde,
        'total', (select count(*) from c),
        'no_encontrados', (select count(*) from c where not encontrado),
        'por_dia', coalesce((
            select jsonb_agg(jsonb_build_object('dia', d.dia, 'total', d.total, 'no', d.no) order by d.dia)
            from (select date_trunc('day', creado)::date as dia, count(*) as total, count(*) filter (where not encontrado) as no
                  from c group by 1) d), '[]'::jsonb),
        'mas_buscados', coalesce((
            select jsonb_agg(jsonb_build_object('codigo', x.codigo, 'nombre', x.nombre, 'veces', x.veces) order by x.veces desc, x.codigo)
            from (select codigo, max(nombre) as nombre, count(*) as veces from c where encontrado
                  group by codigo order by count(*) desc, codigo limit 10) x), '[]'::jsonb),
        'no_encontrados_top', coalesce((
            select jsonb_agg(jsonb_build_object('codigo', x.codigo, 'veces', x.veces, 'ultima', x.ultima) order by x.veces desc, x.codigo)
            from (select codigo, count(*) as veces, max(creado) as ultima from c where not encontrado
                  group by codigo order by count(*) desc, codigo limit 15) x), '[]'::jsonb),
        'por_sucursal', coalesce((
            select jsonb_agg(jsonb_build_object('sucursal', coalesce(s.nombre, '—'), 'total', y.total) order by y.total desc)
            from (select sucursal_id, count(*) as total from c group by sucursal_id) y
            left join public.sucursales s on s.id = y.sucursal_id), '[]'::jsonb)
    ) into v;
    return v;
end $$;

revoke all on function public.resumen_consultas(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.resumen_consultas(uuid, integer, uuid) to authenticated;

-- ---------------------------------------------------------------- 3. limpieza automática
-- Consultas de más de 13 meses, cargas a medias, códigos vencidos e intentos viejos.
create or replace function public.limpiar_datos()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    n1 bigint; n2 bigint; n3 bigint; n4 bigint;
begin
    delete from public.consultas where creado < now() - interval '400 days';
    get diagnostics n1 = row_count;
    delete from public.cargas where creado < now() - interval '1 day';
    get diagnostics n2 = row_count;
    delete from public.vinculos where expira < now() - interval '1 hour';
    get diagnostics n3 = row_count;
    delete from public.intentos_codigo where creado < now() - interval '1 day';
    get diagnostics n4 = row_count;
    return jsonb_build_object('consultas', n1, 'cargas', n2, 'vinculos', n3, 'intentos', n4);
end $$;
revoke all on function public.limpiar_datos() from public, anon, authenticated;

do $outer$
begin
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'prezio-limpieza';
    perform cron.schedule('prezio-limpieza', '17 8 * * *', 'select public.limpiar_datos()');
    raise notice 'Limpieza diaria «prezio-limpieza» activa (4:17 a. m. hora de RD).';
exception when others then
    raise notice 'No se pudo programar la limpieza (%). Activa pg_cron en Database › Extensions y vuelve a ejecutar este archivo.', sqlerrm;
end $outer$;
