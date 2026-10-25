-- =====================================================================
-- Prezio · 0009 · Consulta desde el celular de los clientes (enlace o QR por sucursal, con la cámara)
-- Ejecutar en Supabase › SQL Editor DESPUÉS de 0001–0008. Idempotente.
--
-- Página pública /c/<negocio>/<sucursal>: el cliente escanea con la cámara de su celular (sin cuenta).
-- - Se activa por negocio (publica precios): negocios.consulta_movil, casilla «Apariencia».
-- - Si la sucursal tiene la ubicación activa, la base exige que el celular esté dentro de la distancia.
-- - Cada consulta queda en el reporte (canal «movil»). Límite contra abusos por sucursal.
-- =====================================================================

alter table public.negocios add column if not exists consulta_movil boolean not null default false;
grant update (consulta_movil) on public.negocios to authenticated;     -- regla negocios_editar: casilla «apariencia»

-- Distancia en metros entre dos puntos (haversine).
create or replace function public.distancia_m(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision language sql immutable set search_path = '' as $$
    select 2 * 6371000 * asin(sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)))
$$;

-- Lo que la página pública necesita para mostrarse (sin datos internos ni la ubicación exacta de la tienda).
create or replace function public.movil_info(p_negocio text, p_sucursal text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    v_neg public.negocios;
begin
    select * into v_neg from public.negocios where slug = lower(btrim(coalesce(p_negocio, '')));
    if v_neg.id is null then
        return null;
    end if;
    if not v_neg.consulta_movil then
        return jsonb_build_object('activa', false, 'negocio', jsonb_build_object('nombre', v_neg.nombre));
    end if;
    return jsonb_build_object(
        'activa', true,
        'negocio', jsonb_build_object('nombre', v_neg.nombre, 'slug', v_neg.slug, 'moneda', v_neg.moneda,
            'apariencia', jsonb_build_object(
                'color_marca', v_neg.apariencia -> 'color_marca', 'logo', v_neg.apariencia -> 'logo',
                'mostrar_logo', v_neg.apariencia -> 'mostrar_logo', 'estilo', v_neg.apariencia -> 'estilo')),
        'sucursales', coalesce((
            select jsonb_agg(jsonb_build_object('id', s.id, 'codigo', s.codigo, 'nombre', s.nombre, 'es_principal', s.es_principal,
                                                'ubicacion', s.geo_activa and s.latitud is not null, 'radio_m', s.radio_m)
                             order by s.es_principal desc, s.nombre)
            from public.sucursales s
            where s.negocio_id = v_neg.id and s.activa and (p_sucursal is null or s.codigo = lower(btrim(p_sucursal)))), '[]'::jsonb));
end $$;

-- Consultar un precio desde el celular. Con ubicación activa: p_lat/p_lon del celular dentro de la distancia.
-- Devuelve {encontrado, codigo, nombre, precio} o {error: 'ubicacion' | 'lejos' (con distancia_m) | 'inactiva' | 'limite'}.
create or replace function public.consulta_movil(p_sucursal uuid, p_formas text[], p_lat double precision default null,
                                                 p_lon double precision default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_suc public.sucursales;
    v_neg public.negocios;
    v_inv uuid;
    v_prod public.productos;
    v_leido text := btrim(coalesce(p_formas[1], ''));
    v_dist double precision;
begin
    select * into v_suc from public.sucursales where id = p_sucursal;
    select * into v_neg from public.negocios where id = v_suc.negocio_id;
    if v_suc.id is null or not v_suc.activa or not coalesce(v_neg.consulta_movil, false) then
        return jsonb_build_object('error', 'inactiva');
    end if;
    if v_leido = '' or length(v_leido) > 64 or coalesce(array_length(p_formas, 1), 0) > 16 then
        raise exception 'Código inválido' using errcode = '22023';
    end if;
    if v_suc.geo_activa and v_suc.latitud is not null then
        if p_lat is null or p_lon is null or abs(p_lat) > 90 or abs(p_lon) > 180 then
            return jsonb_build_object('error', 'ubicacion');
        end if;
        v_dist := public.distancia_m(v_suc.latitud, v_suc.longitud, p_lat, p_lon);
        if v_dist > v_suc.radio_m then
            return jsonb_build_object('error', 'lejos', 'distancia_m', round(v_dist), 'radio_m', v_suc.radio_m);
        end if;
    end if;
    -- Contra abusos: máximo 300 consultas desde celulares por minuto en cada sucursal.
    if (select count(*) from public.consultas where sucursal_id = p_sucursal and canal = 'movil'
        and creado > now() - interval '1 minute') >= 300 then
        return jsonb_build_object('error', 'limite');
    end if;
    v_inv := public.inventario_de_sucursal(p_sucursal);
    if v_inv is not null then
        select p.* into v_prod from public.productos p
        where p.inventario_id = v_inv and p.codigo = any (p_formas)
        order by array_position(p_formas, p.codigo) limit 1;
    end if;
    insert into public.consultas (negocio_id, sucursal_id, codigo, encontrado, nombre, precio, canal)
    values (v_suc.negocio_id, p_sucursal, v_leido, v_prod.codigo is not null, v_prod.nombre, v_prod.precio, 'movil');
    if v_prod.codigo is null then
        return jsonb_build_object('encontrado', false, 'codigo', v_leido);
    end if;
    return jsonb_build_object('encontrado', true, 'codigo', v_prod.codigo, 'nombre', v_prod.nombre, 'precio', v_prod.precio);
end $$;

revoke all on function public.distancia_m(double precision, double precision, double precision, double precision),
                       public.movil_info(text, text), public.consulta_movil(uuid, text[], double precision, double precision)
    from public, anon, authenticated;
grant execute on function public.movil_info(text, text), public.consulta_movil(uuid, text[], double precision, double precision)
    to anon, authenticated;
