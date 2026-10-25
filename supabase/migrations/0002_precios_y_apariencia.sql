-- =====================================================================
-- Prezio · 0002 · Consulta de precios por sucursal y logo / QR del negocio
-- Ejecutar en Supabase › SQL Editor DESPUÉS de 0001. Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------- fuente de precios de una sucursal
-- sucursales.fuente:
--   {}                                         → igual que la Principal (la Principal sin fuente: sin precios)
--   {"tipo":"inventario","inventario_id":"…"}  → uno de los inventarios del negocio
-- (Google y SQL Server se suman en la etapa 3.)
create or replace function public.inventario_de_sucursal(p_sucursal uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
    v_suc public.sucursales;
    v_inv uuid;
begin
    select * into v_suc from public.sucursales where id = p_sucursal;
    if not found then
        return null;
    end if;
    if v_suc.fuente ->> 'tipo' is null and not v_suc.es_principal then
        select * into v_suc from public.sucursales where negocio_id = v_suc.negocio_id and es_principal;
    end if;
    if v_suc.fuente ->> 'tipo' = 'inventario' then
        -- Solo un inventario DEL MISMO negocio (aunque alguien escriba otro número en la fuente).
        select i.id into v_inv from public.inventarios i
        where i.id = nullif(v_suc.fuente ->> 'inventario_id', '')::uuid and i.negocio_id = v_suc.negocio_id;
    end if;
    return v_inv;
exception when invalid_text_representation then
    return null;
end $$;

-- ---------------------------------------------------------------- consultar un precio
-- p_formas: el código leído y sus formas equivalentes (UPC-E, UPC-A, EAN-13, sin ceros), la leída primero.
-- Devuelve {"encontrado":bool, "codigo", "nombre", "precio", "sin_fuente":bool} y anota la consulta.
create or replace function public.consultar_precio(p_sucursal uuid, p_formas text[], p_canal text default 'verificador')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_negocio uuid;
    v_inv uuid;
    v_prod public.productos;
    v_leido text := btrim(coalesce(p_formas[1], ''));
begin
    select negocio_id into v_negocio from public.sucursales where id = p_sucursal;
    if v_negocio is null or not public.es_miembro(v_negocio) then
        raise exception 'No tienes acceso a esta sucursal' using errcode = '42501';
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
    return jsonb_build_object('encontrado', true, 'codigo', v_prod.codigo, 'nombre', v_prod.nombre,
                              'precio', v_prod.precio, 'sin_fuente', false);
end $$;

revoke all on function public.inventario_de_sucursal(uuid), public.consultar_precio(uuid, text[], text) from public, anon;
grant execute on function public.inventario_de_sucursal(uuid), public.consultar_precio(uuid, text[], text) to authenticated;

-- ---------------------------------------------------------------- logo y QR (Supabase Storage)
-- Carpeta pública «marcas», una subcarpeta por negocio: marcas/<negocio_id>/logo.png, qr.png.
-- Todos pueden VER las imágenes (salen en los verificadores); solo dueño y admin las cambian.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marcas', 'marcas', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
                                allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.administra_carpeta(p_nombre text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
    return public.administra(split_part(p_nombre, '/', 1)::uuid);
exception when invalid_text_representation then
    return false;
end $$;
revoke all on function public.administra_carpeta(text) from public, anon;
grant execute on function public.administra_carpeta(text) to authenticated;

drop policy if exists marcas_subir on storage.objects;
create policy marcas_subir on storage.objects for insert to authenticated
    with check (bucket_id = 'marcas' and public.administra_carpeta(name));
drop policy if exists marcas_cambiar on storage.objects;
create policy marcas_cambiar on storage.objects for update to authenticated
    using (bucket_id = 'marcas' and public.administra_carpeta(name))
    with check (bucket_id = 'marcas' and public.administra_carpeta(name));
drop policy if exists marcas_borrar on storage.objects;
create policy marcas_borrar on storage.objects for delete to authenticated
    using (bucket_id = 'marcas' and public.administra_carpeta(name));
drop policy if exists marcas_ver on storage.objects;
create policy marcas_ver on storage.objects for select to authenticated
    using (bucket_id = 'marcas');
