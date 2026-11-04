#!/usr/bin/env bash
# Pruebas del verificador en un navegador de verdad (Chromium), contra un PostgreSQL con las migraciones de Prezio.
# Arma la pantalla /equipo, levanta un servidor de prueba que imita a Supabase (puerto 8787) y corre cada prueba
# desde un estado limpio. Las capturas quedan en pruebas/verificador/salida/.
#   En GitHub Actions: PREZIO_PSQL="psql postgresql://…/prezio" bash pruebas/verificador/correr.sh
set -u
cd "$(dirname "$0")"
export PREZIO_SALIDA="${PREZIO_SALIDA:-$PWD/salida}"
mkdir -p "$PREZIO_SALIDA"
ESBUILD="${ESBUILD:-npx --no-install esbuild}"

$ESBUILD entrada.tsx --bundle --jsx=automatic --tsconfig="${PREZIO_TSCONFIG:-../../tsconfig.json}" \
  --outfile="$PREZIO_SALIDA/app.js" --log-level=error \
  --define:process.env.NEXT_PUBLIC_SUPABASE_URL='"http://localhost:8787"' \
  --define:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='"sb_publishable_prueba"' \
  --define:process.env.NODE_ENV='"production"' --banner:js='var process={env:{}};' || { echo "::error::No se pudo armar la pantalla del verificador"; exit 1; }

node servidor.js > "$PREZIO_SALIDA/servidor.log" 2>&1 &
SERVIDOR=$!
trap 'kill $SERVIDOR 2>/dev/null' EXIT
for _ in $(seq 1 50); do curl -s -o /dev/null http://localhost:8787/equipo && break; sleep 0.2; done

limpiar() {
  node -e 'require("./comun").db(`
    delete from public.equipos; delete from public.vinculos; delete from public.negocio_salida;
    update public.negocios set plan = '"'"'prueba'"'"' where nombre = '"'"'Tienda Precios'"'"';
    update public.productos p set precio = 125.5 from public.inventarios i join public.negocios n on n.id = i.negocio_id
      where p.inventario_id = i.id and n.nombre = '"'"'Tienda Precios'"'"' and p.codigo = '"'"'7501055363063'"'"' and p.precio = 199;`)'
}

fallas=0
for t in ${PRUEBAS:-vinculo codigo reloj apps autorizar empleado suspendido}; do
  limpiar
  echo "::group::$t"
  (cd "$PREZIO_SALIDA" && timeout 240 node "$OLDPWD/$t.js") 2>&1 | tee "$PREZIO_SALIDA/$t.txt"
  echo "::endgroup::"
  final=$(grep -E "[0-9]+ bien, [0-9]+ mal" "$PREZIO_SALIDA/$t.txt" | tail -1)
  if ! grep -qE "[0-9]+ bien, 0 mal" <<<"$final"; then
    echo "::error::Fallan pruebas del verificador en $t: ${final:-no terminó}"; fallas=1
  fi
done
exit $fallas
