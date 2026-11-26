#!/usr/bin/env bash
# Recuperación a un momento exacto (en la NUBE). Arma en un contenedor temporal la base de la
# planta tal como estaba en el momento pedido (copia base + cambios guardados), muestra en qué
# tablas difiere de la base actual y deja un .dump en ~/restauraciones. No toca la planta:
# eso lo hace restaurar-momento.sh desde la planta.
#
# Uso:  pitr-restaurar-nube.sh                       muestra desde cuándo se puede volver
#       pitr-restaurar-nube.sh "2026-11-26 10:41"    hora de Colombia
set -euo pipefail

CONF="${CONF:-$HOME/.config/planta-replica.env}"
# shellcheck disable=SC1090
[ -f "$CONF" ] && { set -a; . "$CONF"; set +a; }
USUARIO="${PG_USUARIO:-postgres}"
BD="${PG_BD:-PLANTALOCALDB}"
REPLICA="${REPLICA_PUERTO:-5433}"
IMAGEN="${PG_IMAGEN:-postgres:18}"
ZONA="${ZONA_HORARIA:-America/Bogota}"
VOL=planta-pitr
TMP_VOL=planta-pitr-restaura
TMP=planta-pitr-restaurada
PUERTO=5434
SALIDA="$HOME/restauraciones"

hora() { TZ="$ZONA" date -d "@$1" '+%F %H:%M:%S'; }
bases() { docker run --rm -v "$VOL:/pitr:ro" "$IMAGEN" sh -c 'for b in $(ls /pitr/base | sort); do echo "$b $(cat /pitr/base/$b/fin)"; done'; }

lista="$(bases)"
[ -n "$lista" ] || { echo "No hay copias base todavía (pitr-base-nube.sh)."; exit 1; }
desde="$(echo "$lista" | head -1 | cut -d' ' -f2)"
docker ps --filter name=planta-wal --filter status=running -q | grep -q . ||
  echo "AVISO: el contenedor planta-wal no está corriendo; los cambios recientes pueden faltar."

if [ $# -eq 0 ]; then
  echo "Se puede volver a cualquier momento entre $(hora "$desde") y ahora ($ZONA)."
  exit 0
fi

objetivo="$(TZ="$ZONA" date -d "$1" +%s)" || { echo "Fecha no válida: $1"; exit 1; }
[ "$objetivo" -ge "$desde" ] || { echo "Solo se puede volver hasta $(hora "$desde")."; exit 1; }
[ "$objetivo" -le "$(date +%s)" ] || { echo "Esa hora todavía no ha pasado."; exit 1; }
base="$(echo "$lista" | awk -v o="$objetivo" '$2 <= o { b = $1 } END { print b }')"
meta="$(date -u -d "@$objetivo" '+%F %T+00')"

limpiar() { docker rm -f "$TMP" >/dev/null 2>&1 || true; docker volume rm "$TMP_VOL" >/dev/null 2>&1 || true; }
limpiar
trap limpiar EXIT

echo "1/4 Armando la base desde la copia $base..."
docker volume create "$TMP_VOL" >/dev/null
docker run --rm -v "$VOL:/pitr:ro" -v "$TMP_VOL:/r" -e B="$base" -e META="$meta" "$IMAGEN" sh -c '
set -e
mkdir -p /r/datos && chown postgres:postgres /r/datos && chmod 700 /r/datos
tar -xzf "/pitr/base/$B/base.tar.gz" -C /r/datos
tar -xzf "/pitr/base/$B/pg_wal.tar.gz" -C /r/datos/pg_wal
rm -f /r/datos/standby.signal /r/datos/postmaster.pid
sed -i "/^primary_conninfo/d;/^primary_slot_name/d" /r/datos/postgresql.auto.conf
cat >> /r/datos/postgresql.auto.conf <<EOF
restore_command = '"'"'cp /pitr/wal/%f %p 2>/dev/null || cp /pitr/wal/%f.partial %p'"'"'
recovery_target_time = '"'"'$META'"'"'
recovery_target_action = '"'"'promote'"'"'
EOF
touch /r/datos/recovery.signal
chown -R postgres:postgres /r/datos'

echo "2/4 Aplicando los cambios hasta $(hora "$objetivo")..."
docker run -d --name "$TMP" --network host -u postgres -e PGDATA=/r/datos \
  -v "$VOL:/pitr:ro" -v "$TMP_VOL:/r" "$IMAGEN" \
  postgres -c port="$PUERTO" -c listen_addresses=127.0.0.1 -c archive_mode=off >/dev/null
listo=""
for _ in $(seq 1 300); do
  if [ "$(docker exec "$TMP" psql -p "$PUERTO" -U "$USUARIO" -d postgres -Atc 'SELECT pg_is_in_recovery()' 2>/dev/null)" = "f" ]; then
    listo=1; break
  fi
  docker ps -q --filter "name=$TMP" | grep -q . || break
  sleep 2
done
if [ -z "$listo" ]; then
  echo "ERROR no se pudo armar la base a esa hora:"
  docker logs --tail 15 "$TMP" 2>&1
  exit 1
fi

echo "3/4 Comparando con la base actual (tablas que cambian: ahora -> restaurada)..."
consulta="SELECT format('SELECT %L, count(*), coalesce(md5(string_agg(md5(t::text), '''' ORDER BY md5(t::text))), ''-'') FROM %I t', tablename, tablename) FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename \gexec"
contar() { echo "$consulta" | docker exec -i "$1" psql -p "$2" -U "$USUARIO" -d "$BD" -At -F' '; }
join -a1 -a2 -e 'NO_EXISTE' -o 0,1.2,1.3,2.2,2.3 <(contar planta-replica "$REPLICA" | sort) <(contar "$TMP" "$PUERTO" | sort) |
  awk '$3 != $5 { printf "   %-32s %8s -> %s\n", $1, $2, $4; n++ } END { if (!n) print "   (ninguna: la base de ese momento es igual a la actual)" }'

echo "4/4 Guardando la base restaurada..."
mkdir -p "$SALIDA"
archivo="$SALIDA/momento_$(TZ="$ZONA" date -d "@$objetivo" '+%F_%H%M%S').dump"
docker exec "$TMP" pg_dump -p "$PUERTO" -U "$USUARIO" -d "$BD" -Fc > "$archivo"
find "$SALIDA" -name 'momento_*.dump' -mtime +"${PITR_DIAS:-15}" -delete
echo "DUMP=$archivo"
