-- Consulta desde el celular: revisar si el cliente está dentro de la tienda apenas abre la página,
-- antes de dejarlo leer códigos. No registra consultas ni devuelve la ubicación de la sucursal.
create or replace function public.consulta_movil_lugar(p_sucursal uuid, p_lat double precision default null,
                                                       p_lon double precision default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    v_suc public.sucursales;
    v_neg public.negocios;
    v_dist double precision;
begin
    select * into v_suc from public.sucursales where id = p_sucursal;
    select * into v_neg from public.negocios where id = v_suc.negocio_id;
    if v_suc.id is null or not v_suc.activa or not coalesce(v_neg.consulta_movil, false) or public.negocio_suspendido(v_neg.id) then
        return jsonb_build_object('error', 'inactiva');
    end if;
    if not (v_suc.geo_activa and v_suc.latitud is not null) then
        return jsonb_build_object('ok', true);
    end if;
    if p_lat is null or p_lon is null or abs(p_lat) > 90 or abs(p_lon) > 180 then
        return jsonb_build_object('error', 'ubicacion');
    end if;
    v_dist := public.distancia_m(v_suc.latitud, v_suc.longitud, p_lat, p_lon);
    if v_dist > v_suc.radio_m then
        return jsonb_build_object('error', 'lejos', 'distancia_m', round(v_dist), 'radio_m', v_suc.radio_m);
    end if;
    return jsonb_build_object('ok', true);
end $$;

revoke all on function public.consulta_movil_lugar(uuid, double precision, double precision) from public, anon, authenticated;
grant execute on function public.consulta_movil_lugar(uuid, double precision, double precision) to anon, authenticated;
