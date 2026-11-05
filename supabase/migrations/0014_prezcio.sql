-- =====================================================================
-- Prezcio · 0014 · El sistema pasa a llamarse Prezcio. Ejecutar DESPUÉS de 0013. Idempotente.
--
-- - Las licencias pasan a PREZCIO-XXXX-XXXX-XXXX. Las que ya se entregaron se convierten (mismas 12 letras),
--   y quien escriba todavía la de antes (PREZIO-…) entra igual: se traduce sola.
-- - Los mensajes de la base que decían «Prezio» ahora dicen «Prezcio».
-- =====================================================================

-- La licencia como la escribió la persona → como está guardada (sin espacios, en mayúsculas, PREZIO- → PREZCIO-).
create or replace function public.normalizar_licencia(p text)
returns text language sql immutable set search_path = '' as $$
    select regexp_replace(upper(regexp_replace(coalesce(p, ''), '\s+', '', 'g')), '^PREZIO-', 'PREZCIO-')
$$;

-- Formato nuevo (se quita la regla vieja, se convierten las licencias y se pone la regla nueva).
alter table public.negocios drop constraint if exists negocios_licencia_formato;
update public.negocios set licencia = public.normalizar_licencia(licencia) where licencia like 'PREZIO-%';
alter table public.negocios add constraint negocios_licencia_formato
    check (licencia ~ '^PREZCIO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$');

-- 12 caracteres al azar sin los que se confunden (0/O, 1/I/L): PREZCIO-K7QM-2XRP-H9TD
create or replace function public.generar_licencia()
returns text language plpgsql volatile set search_path = '' as $$
declare
    v_letras constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789A';   -- 32 (la A repetida no importa)
    v_b bytea;
    v text;
begin
    loop
        v_b := sha256(convert_to(gen_random_uuid()::text || clock_timestamp()::text, 'UTF8'));
        v := 'PREZCIO-';
        for i in 0..11 loop
            v := v || substr(v_letras, (get_byte(v_b, i) % 32) + 1, 1);
            if i in (3, 7) then v := v || '-'; end if;
        end loop;
        exit when not exists (select 1 from public.negocios where licencia = v);
    end loop;
    return v;
end $$;

-- Entrar con la licencia (nueva o de antes) o con el código de la dirección (abarrotao-market).
create or replace function public.negocio_de_slug(p_slug text)
returns uuid language sql stable security definer set search_path = '' as $$
    select id from public.negocios
    where licencia = public.normalizar_licencia(p_slug) or slug = lower(btrim(coalesce(p_slug, '')))
    limit 1
$$;

-- Activar la app Prezcio Administrador (acepta también la licencia escrita como antes).
create or replace function public.licencia_info(p_licencia text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    n public.negocios;
begin
    select * into n from public.negocios where licencia = public.normalizar_licencia(p_licencia);
    if n.id is null then
        return null;
    end if;
    return jsonb_build_object('id', n.id, 'nombre', n.nombre, 'licencia', n.licencia,
        'estado', case when n.plan = 'suspendido' then 'suspendida'
                       when public.negocio_suspendido(n.id) then 'vencida'
                       when n.plan = 'prueba' then 'prueba' else 'activa' end);
end $$;

revoke all on function public.normalizar_licencia(text) from public;
grant execute on function public.normalizar_licencia(text) to anon, authenticated;
revoke all on function public.licencia_info(text) from public;
grant execute on function public.licencia_info(text) to anon, authenticated;

-- Los mensajes de las funciones («…tu proveedor de Prezio») pasan a Prezcio, tal como están definidas hoy
-- (se toma la definición vigente de cada una y solo se cambia la palabra; los permisos se conservan).
do $$
declare
    f record;
begin
    for f in
        select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f' and p.prosrc ~ '\mPrezio\M'
    loop
        execute regexp_replace(pg_get_functiondef(f.oid), '\mPrezio\M', 'Prezcio', 'g');
    end loop;
end $$;
