-- =====================================================================
-- Prezcio · 0017 · Ofertas en la pantalla del verificador (como factpos). Ejecutar DESPUÉS de 0016. Idempotente.
--
-- - Cada negocio crea ofertas: precio especial por producto, % de descuento, «lleva N, paga M» o solo un anuncio
--   (con imagen). Con vigencia (desde/hasta, días de la semana, horas) y para todas o algunas sucursales.
-- - En espera, el verificador muestra las ofertas vigentes a un lado del lector (carrusel). Al escanear un producto
--   en oferta muestra el precio de antes tachado, el de oferta y cuánto se ahorra. También la consulta móvil.
-- - Los verificadores las guardan para funcionar sin internet (y deciden la vigencia con la hora corregida).
-- - Las maneja quien tiene el permiso «Inventarios» (los precios).
-- =====================================================================

alter table public.negocios add column if not exists zona_horaria text not null default 'America/Santo_Domingo';

create table if not exists public.ofertas (
    id uuid primary key default gen_random_uuid(),
    negocio_id uuid not null references public.negocios(id) on delete cascade,
    nombre text not null check (length(btrim(nombre)) between 2 and 60),
    descripcion text check (length(descripcion) <= 140),
    tipo text not null default 'precio' check (tipo in ('precio', 'porcentaje', 'lleva_paga', 'aviso')),
    valor numeric(5, 2) check (valor is null or valor between 1 and 90),               -- % de descuento
    lleva integer check (lleva is null or lleva between 2 and 99),
    paga integer check (paga is null or paga between 1 and 98),
    imagen text check (imagen is null or imagen ~ '^https://'),
    sucursales uuid[],                                                                 -- vacío = todas
    desde timestamptz,
    hasta timestamptz,
    dias smallint[] check (dias is null or dias <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]), -- 0 = domingo; vacío = todos
    hora_desde time,
    hora_hasta time,
    activa boolean not null default true,
    orden integer not null default 100,
    creado timestamptz not null default now(),
    actualizado timestamptz not null default now(),
    check (tipo <> 'porcentaje' or valor is not null),
    check (tipo <> 'lleva_paga' or (lleva is not null and paga is not null and paga < lleva)),
    check (hasta is null or desde is null or hasta > desde)
);
create index if not exists ofertas_negocio_idx on public.ofertas (negocio_id, activa);

create table if not exists public.oferta_productos (
    oferta_id uuid not null references public.ofertas(id) on delete cascade,
    codigo text not null check (length(codigo) between 1 and 64),
    precio_oferta numeric(12, 2) check (precio_oferta is null or precio_oferta >= 0),   -- para tipo «precio»
    primary key (oferta_id, codigo)
);
create index if not exists oferta_productos_codigo_idx on public.oferta_productos (codigo);

alter table public.ofertas enable row level security;
alter table public.oferta_productos enable row level security;
revoke all on public.ofertas, public.oferta_productos from anon, authenticated;
grant select on public.ofertas, public.oferta_productos to authenticated;
drop policy if exists ofertas_ver on public.ofertas;
create policy ofertas_ver on public.ofertas for select to authenticated using (public.es_miembro(negocio_id));
drop policy if exists oferta_productos_ver on public.oferta_productos;
create policy oferta_productos_ver on public.oferta_productos for select to authenticated
    using (exists (select 1 from public.ofertas o where o.id = oferta_id and public.es_miembro(o.negocio_id)));

-- ¿Está vigente ahora (en la hora local del negocio) para esta sucursal?
create or replace function public.oferta_vigente(o public.ofertas, p_sucursal uuid, p_ahora timestamptz default now())
returns boolean language sql stable set search_path = '' as $$
    with l as (select (p_ahora at time zone coalesce((select zona_horaria from public.negocios where id = o.negocio_id), 'America/Santo_Domingo')) as t)
    select o.activa
       and (o.desde is null or p_ahora >= o.desde)
       and (o.hasta is null or p_ahora < o.hasta)
       and (o.sucursales is null or cardinality(o.sucursales) = 0 or p_sucursal = any (o.sucursales))
       and (o.dias is null or cardinality(o.dias) = 0 or extract(dow from l.t)::smallint = any (o.dias))
       and (o.hora_desde is null or l.t::time >= o.hora_desde)
       and (o.hora_hasta is null or l.t::time < o.hora_hasta)
    from l
$$;

-- El precio que queda con la oferta (null si la oferta no cambia el precio por unidad: «lleva/paga» o anuncio).
create or replace function public.precio_con_oferta(p_tipo text, p_valor numeric, p_precio numeric, p_precio_oferta numeric)
returns numeric language sql immutable set search_path = '' as $$
    select case p_tipo
        when 'precio' then case when p_precio_oferta is not null and p_precio_oferta < p_precio then p_precio_oferta end
        when 'porcentaje' then round(p_precio * (100 - p_valor) / 100.0, 2)
        else null end
$$;

-- La mejor oferta vigente de un producto (la que deja el precio más bajo; si ninguna baja el precio, la primera).
create or replace function public.oferta_de(p_negocio uuid, p_sucursal uuid, p_codigo text, p_precio numeric)
returns jsonb language sql stable security definer set search_path = '' as $$
    select jsonb_build_object(
        'id', o.id, 'nombre', o.nombre, 'tipo', o.tipo, 'lleva', o.lleva, 'paga', o.paga, 'valor', o.valor,
        'precio_oferta', public.precio_con_oferta(o.tipo, o.valor, p_precio, op.precio_oferta),
        'texto', case o.tipo when 'lleva_paga' then format('Lleva %s, paga %s', o.lleva, o.paga)
                             when 'porcentaje' then format('%s%% de descuento', trim(to_char(o.valor, 'FM990.##')))
                             else o.nombre end)
    from public.ofertas o join public.oferta_productos op on op.oferta_id = o.id
    where o.negocio_id = p_negocio and op.codigo = p_codigo and o.tipo <> 'aviso' and public.oferta_vigente(o, p_sucursal)
    order by coalesce(public.precio_con_oferta(o.tipo, o.valor, p_precio, op.precio_oferta), p_precio), o.orden, o.creado
    limit 1
$$;

-- Las ofertas de una sucursal para la pantalla: las vigentes y las que empiezan después (el verificador sin internet
-- decide solo cuándo mostrarlas). Con nombre y precio de cada producto en el inventario de esa sucursal.
create or replace function public.ofertas_para(p_sucursal uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'nombre', o.nombre, 'descripcion', o.descripcion, 'tipo', o.tipo, 'valor', o.valor,
        'lleva', o.lleva, 'paga', o.paga, 'imagen', o.imagen, 'desde', o.desde, 'hasta', o.hasta, 'dias', o.dias,
        'hora_desde', to_char(o.hora_desde, 'HH24:MI'), 'hora_hasta', to_char(o.hora_hasta, 'HH24:MI'),
        'productos', coalesce((select jsonb_agg(jsonb_build_array(op.codigo, p.nombre, p.precio, op.precio_oferta) order by p.nombre)
                               from public.oferta_productos op
                               join public.productos p on p.codigo = op.codigo and p.inventario_id = public.inventario_de_sucursal(s.id)
                               where op.oferta_id = o.id), '[]'::jsonb))
        order by o.orden, o.creado), '[]'::jsonb)
    from public.sucursales s join public.ofertas o on o.negocio_id = s.negocio_id
    where s.id = p_sucursal and o.activa and (o.hasta is null or o.hasta > now())
      and (o.sucursales is null or cardinality(o.sucursales) = 0 or s.id = any (o.sucursales))
$$;

-- Verificador en el navegador (con sesión) y vista previa del panel.
create or replace function public.ofertas_sucursal(p_sucursal uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
    if not public.es_miembro((select negocio_id from public.sucursales where id = p_sucursal)) then
        raise exception 'No tienes acceso a esta sucursal' using errcode = '42501';
    end if;
    return public.ofertas_para(p_sucursal);
end $$;

-- Verificadores (con su clave): solo si cambiaron desde la última vez.
create or replace function public.equipo_ofertas(p_clave text, p_version text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    v public.equipos := public.equipo_de_clave(p_clave);
    v_ofertas jsonb;
    v_version text;
begin
    if public.negocio_suspendido(v.negocio_id) then
        return jsonb_build_object('version', 'suspendido', 'ofertas', '[]'::jsonb);
    end if;
    v_ofertas := public.ofertas_para(v.sucursal_id);
    v_version := md5(v_ofertas::text);
    if v_version = p_version then
        return jsonb_build_object('version', v_version);
    end if;
    return jsonb_build_object('version', v_version, 'ofertas', v_ofertas);
end $$;

-- Crear o cambiar una oferta. p: {id?, nombre, descripcion, tipo, valor, lleva, paga, imagen, sucursales[], desde, hasta,
-- dias[], hora_desde, hora_hasta, activa, orden, productos: [{codigo, precio}]}. Devuelve {id, sin_encontrar[]}.
create or replace function public.guardar_oferta(p_negocio uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_id uuid := nullif(p ->> 'id', '')::uuid;
    v_tipo text := coalesce(nullif(p ->> 'tipo', ''), 'precio');
    v_suc uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(p -> 'sucursales', '[]'::jsonb)) x);
    v_dias smallint[] := array(select distinct x::smallint from jsonb_array_elements_text(coalesce(p -> 'dias', '[]'::jsonb)) x);
    v_sin text[];
    v_n integer;
begin
    if not public.puede(p_negocio, 'inventarios') then
        raise exception 'No tienes permiso para manejar las ofertas (pide el permiso «Inventarios»)' using errcode = '42501';
    end if;
    if exists (select 1 from unnest(v_suc) s where not exists (select 1 from public.sucursales x where x.id = s and x.negocio_id = p_negocio)) then
        raise exception 'Una de las sucursales no es de este negocio' using errcode = '22023';
    end if;
    if v_id is not null and not exists (select 1 from public.ofertas where id = v_id and negocio_id = p_negocio) then
        raise exception 'Esa oferta no es de este negocio' using errcode = '22023';
    end if;
    if v_tipo <> 'aviso' and coalesce(jsonb_array_length(p -> 'productos'), 0) = 0 then
        raise exception 'Agrega al menos un producto (su código)' using errcode = '22023';
    end if;
    if v_tipo = 'precio' and exists (select 1 from jsonb_array_elements(p -> 'productos') e where nullif(e ->> 'precio', '') is null) then
        raise exception 'Con «precio especial», cada producto lleva su precio de oferta (código y precio)' using errcode = '22023';
    end if;
    if v_id is null then
        insert into public.ofertas (negocio_id, nombre) values (p_negocio, btrim(coalesce(p ->> 'nombre', ''))) returning id into v_id;
    end if;
    update public.ofertas set
        nombre = btrim(coalesce(p ->> 'nombre', '')),
        descripcion = nullif(btrim(coalesce(p ->> 'descripcion', '')), ''),
        tipo = v_tipo,
        valor = case when v_tipo = 'porcentaje' then nullif(p ->> 'valor', '')::numeric end,
        lleva = case when v_tipo = 'lleva_paga' then nullif(p ->> 'lleva', '')::int end,
        paga = case when v_tipo = 'lleva_paga' then nullif(p ->> 'paga', '')::int end,
        imagen = nullif(btrim(coalesce(p ->> 'imagen', '')), ''),
        sucursales = case when cardinality(v_suc) = 0 then null else v_suc end,
        desde = nullif(p ->> 'desde', '')::timestamptz,
        hasta = nullif(p ->> 'hasta', '')::timestamptz,
        dias = case when cardinality(v_dias) in (0, 7) then null else v_dias end,
        hora_desde = nullif(p ->> 'hora_desde', '')::time,
        hora_hasta = nullif(p ->> 'hora_hasta', '')::time,
        activa = coalesce((p ->> 'activa')::boolean, true),
        orden = coalesce(nullif(p ->> 'orden', '')::int, 100),
        actualizado = now()
    where id = v_id;
    delete from public.oferta_productos where oferta_id = v_id;
    insert into public.oferta_productos (oferta_id, codigo, precio_oferta)
    select distinct on (btrim(e ->> 'codigo')) v_id, btrim(e ->> 'codigo'),
           case when v_tipo = 'precio' then nullif(e ->> 'precio', '')::numeric end
    from jsonb_array_elements(coalesce(p -> 'productos', '[]'::jsonb)) e
    where btrim(coalesce(e ->> 'codigo', '')) <> '';
    get diagnostics v_n = row_count;
    if v_n > 300 then
        raise exception 'Una oferta puede tener hasta 300 productos' using errcode = '22023';
    end if;
    -- Códigos que no están en ningún inventario del negocio (se guardan igual: quizá llegan después).
    select array_agg(op.codigo order by op.codigo) into v_sin from public.oferta_productos op
    where op.oferta_id = v_id and not exists (
        select 1 from public.productos x where x.negocio_id = p_negocio and x.codigo = op.codigo);
    return jsonb_build_object('id', v_id, 'sin_encontrar', coalesce(to_jsonb(v_sin), '[]'::jsonb));
end $$;

create or replace function public.borrar_oferta(p_oferta uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
    v_neg uuid := (select negocio_id from public.ofertas where id = p_oferta);
begin
    if v_neg is null or not public.puede(v_neg, 'inventarios') then
        raise exception 'No puedes borrar esa oferta' using errcode = '42501';
    end if;
    delete from public.ofertas where id = p_oferta;
end $$;

create or replace function public.pausar_oferta(p_oferta uuid, p_activa boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
    v_neg uuid := (select negocio_id from public.ofertas where id = p_oferta);
begin
    if v_neg is null or not public.puede(v_neg, 'inventarios') then
        raise exception 'No puedes cambiar esa oferta' using errcode = '42501';
    end if;
    update public.ofertas set activa = coalesce(p_activa, true), actualizado = now() where id = p_oferta;
end $$;

-- Las imágenes de las ofertas (carpeta «<negocio>/ofertas/») las sube quien maneja las ofertas.
create or replace function public.administra_carpeta(p_nombre text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
    if split_part(p_nombre, '/', 2) = 'ofertas' then
        return public.puede(split_part(p_nombre, '/', 1)::uuid, 'inventarios') or public.puede(split_part(p_nombre, '/', 1)::uuid, 'apariencia');
    end if;
    return public.puede(split_part(p_nombre, '/', 1)::uuid, 'apariencia');
exception when invalid_text_representation then
    return false;
end $$;

-- ---------------------------------------------------------------- la consulta incluye la oferta
create or replace function public.consultar_precio(p_sucursal uuid, p_formas text[], p_canal text default 'verificador')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_negocio uuid;
    v_inv uuid;
    v_prod public.productos;
    v_leido text := btrim(coalesce(p_formas[1], ''));
    v_oferta jsonb;
begin
    select negocio_id into v_negocio from public.sucursales where id = p_sucursal;
    if v_negocio is null or not public.es_miembro(v_negocio) then
        raise exception 'No tienes acceso a esta sucursal' using errcode = '42501';
    end if;
    if public.negocio_suspendido(v_negocio) then
        raise exception 'La licencia del negocio está vencida o suspendida: comunícate con tu proveedor de Prezcio' using errcode = '42501';
    end if;
    if v_leido = '' or length(v_leido) > 64 or coalesce(array_length(p_formas, 1), 0) > 16 then
        raise exception 'Código inválido' using errcode = '22023';
    end if;
    v_inv := public.inventario_de_sucursal(p_sucursal);
    if v_inv is null then
        insert into public.consultas (negocio_id, sucursal_id, codigo, encontrado, canal)
        values (v_negocio, p_sucursal, v_leido, false, left(coalesce(nullif(btrim(p_canal), ''), 'verificador'), 30));
        return jsonb_build_object('encontrado', false, 'codigo', v_leido, 'sin_fuente', true);
    end if;
    select p.* into v_prod from public.productos p
    where p.inventario_id = v_inv and p.codigo = any (p_formas)
    order by array_position(p_formas, p.codigo)
    limit 1;
    insert into public.consultas (negocio_id, sucursal_id, codigo, encontrado, nombre, precio, canal)
    values (v_negocio, p_sucursal, v_leido, v_prod.codigo is not null, v_prod.nombre, v_prod.precio,
            left(coalesce(nullif(btrim(p_canal), ''), 'verificador'), 30));
    if v_prod.codigo is null then
        return jsonb_build_object('encontrado', false, 'codigo', v_leido, 'sin_fuente', false);
    end if;
    v_oferta := public.oferta_de(v_negocio, p_sucursal, v_prod.codigo, v_prod.precio);
    return jsonb_build_object('encontrado', true, 'codigo', v_prod.codigo, 'nombre', v_prod.nombre,
                              'precio', v_prod.precio, 'sin_fuente', false, 'oferta', v_oferta);
end $$;

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
    if v_suc.id is null or not v_suc.activa or not coalesce(v_neg.consulta_movil, false) or public.negocio_suspendido(v_neg.id) then
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
    return jsonb_build_object('encontrado', true, 'codigo', v_prod.codigo, 'nombre', v_prod.nombre, 'precio', v_prod.precio,
                              'oferta', public.oferta_de(v_suc.negocio_id, p_sucursal, v_prod.codigo, v_prod.precio));
end $$;

revoke all on function public.oferta_vigente(public.ofertas, uuid, timestamptz), public.precio_con_oferta(text, numeric, numeric, numeric),
    public.oferta_de(uuid, uuid, text, numeric), public.ofertas_para(uuid), public.ofertas_sucursal(uuid),
    public.equipo_ofertas(text, text), public.guardar_oferta(uuid, jsonb), public.borrar_oferta(uuid), public.pausar_oferta(uuid, boolean)
    from public, anon, authenticated;
grant execute on function public.ofertas_sucursal(uuid), public.guardar_oferta(uuid, jsonb), public.borrar_oferta(uuid),
    public.pausar_oferta(uuid, boolean) to authenticated;
grant execute on function public.equipo_ofertas(text, text) to anon, authenticated;
