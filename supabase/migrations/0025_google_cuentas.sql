-- Google Drive conectado por negocio: Prezcio muestra la lista de hojas del cliente y las lee sola,
-- sin compartirlas por enlace. El permiso (refresh token) se guarda CIFRADO por el servidor de Prezcio:
-- la base nunca ve el token en claro y nadie lo lee con la API (solo estas funciones, con permiso).

create table if not exists public.google_cuentas (
    id uuid primary key default gen_random_uuid(),
    negocio_id uuid not null references public.negocios(id) on delete cascade,
    correo text not null check (length(correo) between 3 and 320),
    cifrado text not null check (length(cifrado) between 20 and 4000),
    creado timestamptz not null default now(),
    actualizado timestamptz not null default now(),
    creado_por uuid references auth.users(id) on delete set null,
    unique (negocio_id, correo)
);
alter table public.google_cuentas enable row level security;
revoke all on public.google_cuentas from anon, authenticated;

-- Cuentas conectadas del negocio (sin el token).
create or replace function public.google_cuentas_de(p_negocio uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
    if not public.puede(p_negocio, 'inventarios') then return '[]'::jsonb; end if;
    return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'correo', correo, 'creado', creado) order by creado)
                     from public.google_cuentas where negocio_id = p_negocio), '[]'::jsonb);
end $$;

create or replace function public.google_puede(p_negocio uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select coalesce(public.puede(p_negocio, 'inventarios'), false)
$$;

-- Guardar (o renovar) la conexión. p_cifrado ya viene cifrado por el servidor de Prezcio.
create or replace function public.google_guardar_cuenta(p_negocio uuid, p_correo text, p_cifrado text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
    if not public.puede(p_negocio, 'inventarios') then
        raise exception 'No tienes permiso para conectar Google Drive en este negocio' using errcode = '42501';
    end if;
    insert into public.google_cuentas (negocio_id, correo, cifrado, creado_por)
    values (p_negocio, lower(btrim(p_correo)), p_cifrado, auth.uid())
    on conflict (negocio_id, correo) do update set cifrado = excluded.cifrado, actualizado = now()
    returning id into v;
    return v;
end $$;

-- El token cifrado, para que el servidor de Prezcio lo use en nombre de quien tiene permiso.
create or replace function public.google_cuenta_cifrada(p_cuenta uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare c public.google_cuentas%rowtype;
begin
    select * into c from public.google_cuentas where id = p_cuenta;
    if not found or not public.puede(c.negocio_id, 'inventarios') then
        raise exception 'Esa conexión de Google Drive no existe o no es de tu negocio' using errcode = '42501';
    end if;
    return c.cifrado;
end $$;

-- Desconectar: borra la conexión y devuelve el token cifrado para revocarlo en Google.
create or replace function public.google_quitar_cuenta(p_cuenta uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare c public.google_cuentas%rowtype;
begin
    select * into c from public.google_cuentas where id = p_cuenta;
    if not found or not public.puede(c.negocio_id, 'inventarios') then
        raise exception 'Esa conexión de Google Drive no existe o no es de tu negocio' using errcode = '42501';
    end if;
    delete from public.google_cuentas where id = p_cuenta;
    return c.cifrado;
end $$;

revoke all on function public.google_cuentas_de(uuid), public.google_puede(uuid), public.google_guardar_cuenta(uuid, text, text),
    public.google_cuenta_cifrada(uuid), public.google_quitar_cuenta(uuid) from public, anon;
grant execute on function public.google_cuentas_de(uuid), public.google_puede(uuid), public.google_guardar_cuenta(uuid, text, text),
    public.google_cuenta_cifrada(uuid), public.google_quitar_cuenta(uuid) to authenticated;

-- La tarea programada recibe también el token cifrado de las hojas conectadas con Google Drive
-- (solo si la conexión es del mismo negocio que el inventario).
create or replace function public.google_pendientes(p_secreto text, p_maximo integer default 10)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v jsonb;
begin
    if not public.secreto_tareas_valido(p_secreto) then
        raise exception 'No autorizado' using errcode = '42501';
    end if;
    with tocan as (
        select i.id from public.inventarios i
        where i.origen ->> 'tipo' = 'google'
          and coalesce((i.estado ->> 'intento')::timestamptz, 'epoch'::timestamptz)
              < now() - make_interval(mins => greatest(15, coalesce((i.origen ->> 'cada_min')::int, 60))) + interval '1 minute'
        order by coalesce((i.estado ->> 'intento')::timestamptz, 'epoch'::timestamptz)
        limit least(greatest(coalesce(p_maximo, 10), 1), 50)
        for update skip locked
    ), marcadas as (
        update public.inventarios i set estado = i.estado || jsonb_build_object('intento', now())
        from tocan where i.id = tocan.id
        returning i.id, i.origen, i.negocio_id
    )
    select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'origen', m.origen, 'cifrado', g.cifrado)), '[]'::jsonb) into v
    from marcadas m
    left join public.google_cuentas g
      on g.negocio_id = m.negocio_id
     and (m.origen ->> 'cuenta') ~ '^[0-9a-f-]{36}$' and g.id = (m.origen ->> 'cuenta')::uuid;
    return v;
end $$;
