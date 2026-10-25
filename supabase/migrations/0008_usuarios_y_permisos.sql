-- =====================================================================
-- Prezio · 0008 · Usuarios sin correo y permisos por casillas
-- Ejecutar en Supabase › SQL Editor DESPUÉS de 0001–0007. Idempotente.
--
-- Permisos (casillas) de cada persona en un negocio:
--   reportes · inventarios · sucursales · equipos · apariencia · usuarios
-- y en qué sucursales aplican (todas, o una lista). El dueño puede todo siempre.
-- Las personas que ya existen reciben las casillas de su rol de hoy (nadie gana ni pierde acceso):
--   admin → todas · encargado → reportes, sucursales y equipos de su sucursal · verificador → ninguna.
--
-- Usuarios sin correo: el dueño (o quien tenga «usuarios») crea «juan» con su clave; entra con
-- negocio + usuario + clave. Por dentro es una cuenta de Supabase con un correo que no existe
-- (juan@n<negocio>.prezio.invalid): nunca recibe correos y su clave solo la cambia quien administra.
-- =====================================================================

-- ---------------------------------------------------------------- columnas
alter table public.miembros add column if not exists permisos text[] not null default '{}';
alter table public.miembros add column if not exists sucursales uuid[];          -- null = todas
alter table public.miembros add column if not exists usuario text;
do $$ begin
    alter table public.miembros add constraint miembros_permisos_validos
        check (permisos <@ array['reportes', 'inventarios', 'sucursales', 'equipos', 'apariencia', 'usuarios']);
exception when duplicate_object then null;
end $$;
do $$ begin
    alter table public.miembros add constraint miembros_usuario_valido check (usuario ~ '^[a-z0-9][a-z0-9._-]{2,29}$');
exception when duplicate_object then null;
end $$;
create unique index if not exists miembros_usuario_unico on public.miembros (negocio_id, usuario) where usuario is not null;

-- Casillas que corresponden a cada rol (para las personas de antes y las invitaciones por correo).
create or replace function public.permisos_de_rol(p_rol public.rol_negocio)
returns text[] language sql immutable set search_path = '' as $$
    select case p_rol
        when 'dueno' then array['reportes', 'inventarios', 'sucursales', 'equipos', 'apariencia', 'usuarios']
        when 'admin' then array['reportes', 'inventarios', 'sucursales', 'equipos', 'apariencia', 'usuarios']
        when 'encargado' then array['reportes', 'sucursales', 'equipos']
        else array[]::text[] end
$$;

-- Al entrar por invitación (o al cambiar de rol por invitación): casillas del rol.
create or replace function public.miembros_por_rol()
returns trigger language plpgsql set search_path = '' as $$
begin
    if tg_op = 'INSERT' and coalesce(cardinality(new.permisos), 0) = 0 and new.usuario is null then
        new.permisos := public.permisos_de_rol(new.rol);
        new.sucursales := case when new.rol = 'encargado' then array[new.sucursal_id] end;
    elsif tg_op = 'UPDATE' and new.rol is distinct from old.rol
          and new.permisos is not distinct from old.permisos and new.sucursales is not distinct from old.sucursales then
        new.permisos := public.permisos_de_rol(new.rol);
        new.sucursales := case when new.rol = 'encargado' then array[new.sucursal_id] end;
    end if;
    return new;
end $$;
drop trigger if exists miembros_por_rol on public.miembros;
create trigger miembros_por_rol before insert or update of rol on public.miembros
    for each row execute function public.miembros_por_rol();

-- Las personas que ya existen: las casillas de su rol (solo una vez: a quien no tenga ninguna).
update public.miembros set
    permisos = public.permisos_de_rol(rol),
    sucursales = case when rol = 'encargado' then array[sucursal_id] end
where cardinality(permisos) = 0 and rol <> 'verificador';

-- ---------------------------------------------------------------- la regla: ¿puede?
-- p_sucursal null = una acción de todo el negocio (cargar inventarios, apariencia…): requiere el permiso
-- en TODAS las sucursales. Con sucursal: basta que esa sucursal esté en su lista.
create or replace function public.puede(p_negocio uuid, p_permiso text, p_sucursal uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.miembros m
        where m.negocio_id = p_negocio and m.user_id = auth.uid()
          and (m.rol = 'dueno'
               or (p_permiso = any (m.permisos)
                   and (m.sucursales is null or (p_sucursal is not null and p_sucursal = any (m.sucursales))))))
$$;

-- Sucursales donde tiene un permiso: null = todas; [] = ninguna.
create or replace function public.sucursales_de(p_negocio uuid, p_permiso text)
returns uuid[] language sql stable security definer set search_path = '' as $$
    select case when m.rol = 'dueno' then null
                when p_permiso = any (m.permisos) then m.sucursales
                else array[]::uuid[] end
    from public.miembros m where m.negocio_id = p_negocio and m.user_id = auth.uid()
$$;

-- Las reglas viejas, para lo que todavía las nombre: «administra» = todas las casillas en todas las
-- sucursales; «encarga» = equipos en esa sucursal.
create or replace function public.administra(p_negocio uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.miembros m
                   where m.negocio_id = p_negocio and m.user_id = auth.uid()
                     and (m.rol = 'dueno' or (m.sucursales is null and m.permisos @> public.permisos_de_rol('admin'))))
$$;
create or replace function public.encarga(p_negocio uuid, p_sucursal uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select public.puede(p_negocio, 'equipos', p_sucursal)
$$;

-- ---------------------------------------------------------------- reglas de acceso (RLS) por casilla
drop policy if exists negocios_editar on public.negocios;
create policy negocios_editar on public.negocios for update to authenticated
    using (public.puede(id, 'apariencia')) with check (public.puede(id, 'apariencia'));
drop policy if exists sucursales_crear on public.sucursales;
create policy sucursales_crear on public.sucursales for insert to authenticated
    with check (public.puede(negocio_id, 'sucursales') and not es_principal);
drop policy if exists sucursales_editar on public.sucursales;
create policy sucursales_editar on public.sucursales for update to authenticated
    using (public.puede(negocio_id, 'sucursales', id)) with check (public.puede(negocio_id, 'sucursales', id));
drop policy if exists sucursales_borrar on public.sucursales;
create policy sucursales_borrar on public.sucursales for delete to authenticated
    using (public.puede(negocio_id, 'sucursales') and not es_principal);
drop policy if exists invitaciones_ver on public.invitaciones;
create policy invitaciones_ver on public.invitaciones for select to authenticated using (public.puede(negocio_id, 'usuarios'));
drop policy if exists inventarios_escribir on public.inventarios;
create policy inventarios_escribir on public.inventarios for all to authenticated
    using (public.puede(negocio_id, 'inventarios')) with check (public.puede(negocio_id, 'inventarios'));
drop policy if exists productos_escribir on public.productos;
create policy productos_escribir on public.productos for all to authenticated
    using (public.puede(negocio_id, 'inventarios')) with check (public.puede(negocio_id, 'inventarios'));
drop policy if exists consultas_ver on public.consultas;
create policy consultas_ver on public.consultas for select to authenticated
    using (public.puede(negocio_id, 'reportes', sucursal_id));
drop policy if exists equipos_ver on public.equipos;
create policy equipos_ver on public.equipos for select to authenticated
    using (public.puede(negocio_id, 'equipos', sucursal_id));
drop policy if exists conectores_ver on public.conectores;
create policy conectores_ver on public.conectores for select to authenticated using (public.puede(negocio_id, 'inventarios'));
drop policy if exists salida_ver on public.negocio_salida;
create policy salida_ver on public.negocio_salida for select to authenticated using (public.puede(negocio_id, 'equipos'));

-- ---------------------------------------------------------------- funciones que ahora preguntan por su casilla
create or replace function public.reemplazar_productos(p_inventario uuid, p_productos jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
    v_negocio uuid;
    v_n integer;
begin
    select negocio_id into v_negocio from public.inventarios where id = p_inventario;
    if v_negocio is null or not public.puede(v_negocio, 'inventarios') then
        raise exception 'No tienes permiso sobre este inventario' using errcode = '42501';
    end if;
    delete from public.productos where inventario_id = p_inventario;
    insert into public.productos (inventario_id, negocio_id, codigo, nombre, precio)
        select distinct on (x.codigo) p_inventario, v_negocio, btrim(x.codigo), btrim(x.nombre), x.precio
        from jsonb_to_recordset(p_productos) as x(codigo text, nombre text, precio numeric)
        where btrim(coalesce(x.codigo, '')) <> '' and btrim(coalesce(x.nombre, '')) <> '' and x.precio >= 0;
    get diagnostics v_n = row_count;
    update public.inventarios set actualizado = now() where id = p_inventario;
    return v_n;
end $$;

create or replace function public.administra_carpeta(p_nombre text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
    return public.puede(split_part(p_nombre, '/', 1)::uuid, 'apariencia');
exception when invalid_text_representation then
    return false;
end $$;

create or replace function public.vincular_equipo(p_codigo text, p_sucursal uuid, p_nombre text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    v_vinculo public.vinculos;
    v_negocio uuid;
    v_id uuid;
    v_codigo text := regexp_replace(coalesce(p_codigo, ''), '[^0-9]', '', 'g');
begin
    select negocio_id into v_negocio from public.sucursales where id = p_sucursal;
    if v_negocio is null or not (public.puede(v_negocio, 'equipos', p_sucursal)) then
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

create or replace function public.cambiar_equipo(p_equipo uuid, p_nombre text, p_sucursal uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
    v public.equipos;
begin
    select * into v from public.equipos where id = p_equipo;
    if v.id is null or not (public.puede(v.negocio_id, 'equipos', v.sucursal_id)) then
        raise exception 'No puedes cambiar este equipo' using errcode = '42501';
    end if;
    if p_sucursal is not null and p_sucursal <> v.sucursal_id then
        -- A otra sucursal del mismo negocio, y el encargado solo a la suya.
        if not exists (select 1 from public.sucursales where id = p_sucursal and negocio_id = v.negocio_id)
           or not (public.puede(v.negocio_id, 'equipos', p_sucursal)) then
            raise exception 'No puedes mover el equipo a esa sucursal' using errcode = '42501';
        end if;
    end if;
    update public.equipos
    set nombre = coalesce(nullif(left(btrim(coalesce(p_nombre, '')), 60), ''), nombre),
        sucursal_id = coalesce(p_sucursal, sucursal_id)
    where id = p_equipo;
end $$;

create or replace function public.quitar_equipo(p_equipo uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
    v public.equipos;
begin
    select * into v from public.equipos where id = p_equipo;
    if v.id is null or not (public.puede(v.negocio_id, 'equipos', v.sucursal_id)) then
        raise exception 'No puedes quitar este equipo' using errcode = '42501';
    end if;
    delete from public.equipos where id = p_equipo;
end $$;

create or replace function public.cargar_inventario(p_inventario uuid, p_lote uuid, p_productos jsonb, p_fin boolean,
                                                    p_error text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
    v_negocio uuid;
begin
    select negocio_id into v_negocio from public.inventarios where id = p_inventario;
    if v_negocio is null or not public.puede(v_negocio, 'inventarios') then
        raise exception 'No tienes permiso sobre este inventario' using errcode = '42501';
    end if;
    if p_error is not null then
        perform public.anotar_error_fuente(p_inventario, p_error);
        return 0;
    end if;
    return public.recibir_parte(p_inventario, p_lote, p_productos, p_fin);
end $$;

create or replace function public.crear_conector(p_negocio uuid, p_nombre text)
returns text language plpgsql security definer set search_path = '' as $$
declare
    v_clave text := 'pzc_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
    if not public.puede(p_negocio, 'inventarios') then
        raise exception 'Solo el dueño o un administrador crean conectores' using errcode = '42501';
    end if;
    if (select count(*) from public.conectores where negocio_id = p_negocio) >= 10 then
        raise exception 'Máximo 10 conectores por negocio' using errcode = '54000';
    end if;
    insert into public.conectores (negocio_id, nombre, huella, creado_por)
    values (p_negocio, coalesce(nullif(left(btrim(coalesce(p_nombre, '')), 60), ''), 'Conector'),
            public.huella_de(v_clave), auth.uid());
    return v_clave;   -- única vez que se ve
end $$;

create or replace function public.quitar_conector(p_conector uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
    v_negocio uuid;
begin
    select negocio_id into v_negocio from public.conectores where id = p_conector;
    if v_negocio is null or not public.puede(v_negocio, 'inventarios') then
        raise exception 'No puedes quitar este conector' using errcode = '42501';
    end if;
    delete from public.conectores where id = p_conector;
end $$;

create or replace function public.vincular_en_equipo(p_clave text, p_sucursal uuid, p_nombre text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_negocio uuid;
    v_huella bytea;
    v_id uuid;
begin
    if p_clave is null or length(p_clave) < 32 or length(p_clave) > 128 then
        raise exception 'Clave de equipo inválida' using errcode = '22023';
    end if;
    select negocio_id into v_negocio from public.sucursales where id = p_sucursal;
    if v_negocio is null or not (public.puede(v_negocio, 'equipos', p_sucursal)) then
        raise exception 'Tu usuario no puede poner equipos en esa sucursal' using errcode = '42501';
    end if;
    v_huella := public.huella_de(p_clave);
    if exists (select 1 from public.equipos where huella = v_huella) then
        raise exception 'Este equipo ya está vinculado' using errcode = '22023';
    end if;
    delete from public.vinculos where huella = v_huella;   -- su código de 8 cifras ya no hace falta
    insert into public.equipos (negocio_id, sucursal_id, nombre, huella, creado_por)
    values (v_negocio, p_sucursal,
            coalesce(nullif(left(btrim(coalesce(p_nombre, '')), 60), ''),
                     'Equipo ' || (select count(*) + 1 from public.equipos where negocio_id = v_negocio)),
            v_huella, auth.uid())
    returning id into v_id;
    return jsonb_build_object('equipo', v_id);
end $$;

create or replace function public.guardar_salida(p_negocio uuid, p_salida jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
    if not public.puede(p_negocio, 'equipos') then
        raise exception 'Solo el dueño o un administrador cambian la clave de salida' using errcode = '42501';
    end if;
    if p_salida is null then
        delete from public.negocio_salida where negocio_id = p_negocio;
        return;
    end if;
    insert into public.negocio_salida (negocio_id, salida, cambiada_por)
    values (p_negocio, jsonb_build_object('sal', p_salida ->> 'sal', 'iter', (p_salida ->> 'iter')::int, 'hash', p_salida ->> 'hash'), auth.uid())
    on conflict (negocio_id) do update set salida = excluded.salida, cambiada = now(), cambiada_por = auth.uid();
end $$;

create or replace function public.resumen_consultas(p_negocio uuid, p_dias integer default 7, p_sucursal uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    v_sucursal uuid := p_sucursal;
    v_desde timestamptz := date_trunc('day', now()) - make_interval(days => least(greatest(coalesce(p_dias, 7), 1), 400) - 1);
    v jsonb;
    v_alcance uuid[];
begin
    -- Con «reportes» en todas las sucursales ve todo (o la sucursal que pida); con algunas, solo esas.
    if not public.puede(p_negocio, 'reportes') then
        v_alcance := public.sucursales_de(p_negocio, 'reportes');
        if v_alcance is null or cardinality(v_alcance) = 0 then
            raise exception 'No tienes acceso a los reportes de este negocio' using errcode = '42501';
        end if;
        if v_sucursal is not null and not (v_sucursal = any (v_alcance)) then
            v_sucursal := null;
        end if;
    end if;
    with c as (
        select * from public.consultas
        where negocio_id = p_negocio and creado >= v_desde and (v_sucursal is null or sucursal_id = v_sucursal)
          and (v_alcance is null or sucursal_id = any (v_alcance))
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

-- ---------------------------------------------------------------- personas: invitar, quitar, cambiar permisos
-- Reglas: nadie toca al dueño; solo el dueño da la casilla «usuarios» o invita administradores; quien no es
-- dueño solo da casillas y sucursales que él mismo tiene, y no se cambia a sí mismo.
create or replace function public.puede_dar(p_negocio uuid, p_permisos text[], p_sucursales uuid[])
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
    v public.miembros;
begin
    select * into v from public.miembros where negocio_id = p_negocio and user_id = auth.uid();
    if v.user_id is null then return false; end if;
    if v.rol = 'dueno' then return true; end if;
    if not ('usuarios' = any (v.permisos)) or 'usuarios' = any (coalesce(p_permisos, '{}')) then return false; end if;
    if not (coalesce(p_permisos, '{}') <@ v.permisos) then return false; end if;
    if v.sucursales is not null and (p_sucursales is null or not (p_sucursales <@ v.sucursales)) then return false; end if;
    return true;
end $$;

create or replace function public.invitar(p_negocio uuid, p_correo text, p_rol public.rol_negocio,
                                          p_sucursal uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    v_token uuid;
begin
    if not public.puede(p_negocio, 'usuarios') then
        raise exception 'No tienes permiso para invitar en este negocio' using errcode = '42501';
    end if;
    if p_rol = 'dueno' then
        raise exception 'No se puede invitar a otro dueño' using errcode = '22023';
    end if;
    if not public.puede_dar(p_negocio, public.permisos_de_rol(p_rol), case when p_rol = 'encargado' then array[p_sucursal] end) then
        raise exception 'Solo el dueño puede invitar administradores' using errcode = '42501';
    end if;
    insert into public.invitaciones (negocio_id, correo, rol, sucursal_id, invitado_por)
        values (p_negocio, lower(btrim(p_correo)), p_rol, case when p_rol = 'encargado' then p_sucursal end, auth.uid())
        returning token into v_token;
    return v_token;
end $$;

create or replace function public.quitar_miembro(p_negocio uuid, p_usuario uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
    v_el public.miembros;
begin
    select * into v_el from public.miembros where negocio_id = p_negocio and user_id = p_usuario;
    if v_el.user_id is null then
        return;
    end if;
    if v_el.rol = 'dueno' or p_usuario = auth.uid() or not public.puede(p_negocio, 'usuarios')
       or not public.puede_dar(p_negocio, v_el.permisos, v_el.sucursales) then
        raise exception 'No tienes permiso para quitar a esta persona' using errcode = '42501';
    end if;
    delete from public.miembros where negocio_id = p_negocio and user_id = p_usuario;
end $$;

create or replace function public.cambiar_permisos(p_negocio uuid, p_usuario uuid, p_permisos text[], p_sucursales uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
    v_el public.miembros;
    v_permisos text[] := array(select distinct x from unnest(coalesce(p_permisos, '{}')) x order by 1);
    v_sucursales uuid[] := case when p_sucursales is null then null
                                else array(select distinct x from unnest(p_sucursales) x order by 1) end;
begin
    select * into v_el from public.miembros where negocio_id = p_negocio and user_id = p_usuario;
    if v_el.user_id is null then
        raise exception 'Esa persona no está en este negocio' using errcode = '22023';
    end if;
    if v_el.rol = 'dueno' or p_usuario = auth.uid() then
        raise exception 'Los permisos del dueño y los propios no se cambian aquí' using errcode = '42501';
    end if;
    if not public.puede(p_negocio, 'usuarios')
       or not public.puede_dar(p_negocio, v_el.permisos, v_el.sucursales)         -- puede tocar a esa persona
       or not public.puede_dar(p_negocio, v_permisos, v_sucursales) then          -- y darle lo nuevo
        raise exception 'No puedes dar esos permisos' using errcode = '42501';
    end if;
    if v_sucursales is not null and exists (
        select 1 from unnest(v_sucursales) s where not exists (select 1 from public.sucursales x where x.id = s and x.negocio_id = p_negocio)) then
        raise exception 'Sucursal de otro negocio' using errcode = '22023';
    end if;
    update public.miembros set permisos = v_permisos, sucursales = v_sucursales,
        -- el rol queda como etiqueta: «admin» si tiene todo, si no «verificador» (= empleado con casillas)
        rol = case when v_sucursales is null and v_permisos @> public.permisos_de_rol('admin') then 'admin'::public.rol_negocio
                   else 'verificador'::public.rol_negocio end,
        sucursal_id = null
    where negocio_id = p_negocio and user_id = p_usuario;
end $$;

-- ---------------------------------------------------------------- usuarios sin correo
create or replace function public.correo_de_usuario(p_negocio uuid, p_usuario text)
returns text language sql immutable set search_path = '' as $$
    select lower(btrim(p_usuario)) || '@n' || replace(p_negocio::text, '-', '') || '.prezio.invalid'
$$;

-- Para la pantalla de entrar (sin sesión): el número del negocio por su código. Los códigos ya son
-- públicos (van en la dirección del verificador); no revela usuarios.
create or replace function public.negocio_de_slug(p_slug text)
returns uuid language sql stable security definer set search_path = '' as $$
    select id from public.negocios where slug = lower(btrim(p_slug))
$$;

-- El servidor de Prezio crea la cuenta (con la clave de servidor) y después, con la sesión de quien
-- administra, la suma al negocio con sus casillas. Solo acepta cuentas con el correo interno de ESE usuario.
create or replace function public.agregar_usuario(p_negocio uuid, p_cuenta uuid, p_usuario text, p_nombre text,
                                                  p_permisos text[], p_sucursales uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
    v_usuario text := lower(btrim(coalesce(p_usuario, '')));
    v_permisos text[] := array(select distinct x from unnest(coalesce(p_permisos, '{}')) x order by 1);
begin
    if not public.puede(p_negocio, 'usuarios') or not public.puede_dar(p_negocio, v_permisos, p_sucursales) then
        raise exception 'No puedes crear usuarios con esos permisos' using errcode = '42501';
    end if;
    if not exists (select 1 from auth.users u where u.id = p_cuenta and u.email = public.correo_de_usuario(p_negocio, v_usuario)) then
        raise exception 'Cuenta de usuario no válida' using errcode = '22023';
    end if;
    insert into public.miembros (negocio_id, user_id, rol, usuario, permisos, sucursales)
    values (p_negocio, p_cuenta,
            case when p_sucursales is null and v_permisos @> public.permisos_de_rol('admin') then 'admin'::public.rol_negocio
                 else 'verificador'::public.rol_negocio end,
            v_usuario, v_permisos, p_sucursales);
    update public.perfiles set nombre = left(btrim(coalesce(nullif(p_nombre, ''), v_usuario)), 80) where id = p_cuenta;
end $$;

-- ¿Puede quien llama cambiar la clave o borrar la cuenta de ese usuario? (solo cuentas sin correo de este negocio)
create or replace function public.puede_administrar_usuario(p_negocio uuid, p_cuenta uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
    v_el public.miembros;
begin
    select * into v_el from public.miembros where negocio_id = p_negocio and user_id = p_cuenta;
    return v_el.user_id is not null and v_el.usuario is not null and v_el.rol <> 'dueno' and p_cuenta <> auth.uid()
       and public.puede(p_negocio, 'usuarios') and public.puede_dar(p_negocio, v_el.permisos, v_el.sucursales)
       and exists (select 1 from auth.users u where u.id = p_cuenta and u.email = public.correo_de_usuario(p_negocio, v_el.usuario));
end $$;

-- Una cuenta de empleado (correo interno …prezio.invalid) no crea negocios propios.
create or replace function public.crear_negocio(p_nombre text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    v_usuario uuid := auth.uid();
    v_nombre text := btrim(coalesce(p_nombre, ''));
    v_base text;
    v_slug text;
    v_id uuid;
    v_n integer := 1;
begin
    if v_usuario is null then
        raise exception 'Inicia sesión para crear un negocio' using errcode = '28000';
    end if;
    if exists (select 1 from auth.users u where u.id = v_usuario and u.email like '%.prezio.invalid') then
        raise exception 'Los usuarios de un negocio no crean negocios: entra con tu correo' using errcode = '42501';
    end if;
    if length(v_nombre) < 2 or length(v_nombre) > 80 then
        raise exception 'El nombre del negocio debe tener entre 2 y 80 caracteres' using errcode = '22023';
    end if;
    if (select count(*) from public.negocios where creado_por = v_usuario) >= 5 then
        raise exception 'Ya creaste 5 negocios; escribe a soporte para crear más' using errcode = '54000';
    end if;
    v_base := trim(both '-' from regexp_replace(
                  lower(translate(v_nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '[^a-z0-9]+', '-', 'g'));
    v_base := left(coalesce(nullif(v_base, ''), 'negocio'), 32);
    if length(v_base) < 3 then
        v_base := v_base || '-negocio';
    end if;
    v_slug := v_base;
    while exists (select 1 from public.negocios where slug = v_slug) loop
        v_n := v_n + 1;
        v_slug := v_base || '-' || v_n;
    end loop;
    insert into public.negocios (nombre, slug, creado_por) values (v_nombre, v_slug, v_usuario)
        returning id into v_id;
    insert into public.miembros (negocio_id, user_id, rol) values (v_id, v_usuario, 'dueno');
    insert into public.sucursales (negocio_id, codigo, nombre, es_principal)
        values (v_id, 'principal', 'Principal', true);
    return v_id;
end $$;

-- ---------------------------------------------------------------- permisos de las funciones
revoke all on function public.permisos_de_rol(public.rol_negocio), public.puede(uuid, text, uuid), public.sucursales_de(uuid, text),
                       public.puede_dar(uuid, text[], uuid[]), public.cambiar_permisos(uuid, uuid, text[], uuid[]),
                       public.correo_de_usuario(uuid, text), public.negocio_de_slug(text),
                       public.agregar_usuario(uuid, uuid, text, text, text[], uuid[]), public.puede_administrar_usuario(uuid, uuid)
    from public, anon, authenticated;
grant execute on function public.puede(uuid, text, uuid), public.sucursales_de(uuid, text), public.puede_dar(uuid, text[], uuid[]),
                          public.cambiar_permisos(uuid, uuid, text[], uuid[]), public.correo_de_usuario(uuid, text),
                          public.agregar_usuario(uuid, uuid, text, text, text[], uuid[]), public.puede_administrar_usuario(uuid, uuid),
                          public.permisos_de_rol(public.rol_negocio)
    to authenticated;
grant execute on function public.negocio_de_slug(text), public.correo_de_usuario(uuid, text) to anon;
