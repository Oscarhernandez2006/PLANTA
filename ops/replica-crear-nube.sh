#!/usr/bin/env bash
# Réplica en tiempo real (paso 3, en el servidor de la NUBE): crea la réplica de solo lectura
# de la BD de la planta. Copia la base completa una vez (pg_basebackup por el túnel) y desde
# ahí recibe cada cambio en segundos. Las migraciones se aplican SOLO en la planta y llegan solas.
# No toca la base de la nube que usa hoy espejo-nube.sh: la réplica es un contenedor aparte.
#
# Configuración (chmod 600): ~/.config/planta-replica.env
#   REPLICA_CLAVE=<la misma de la planta>
#   TUNEL_PUERTO=15432          donde el túnel publica la BD de la planta
#   REPLICA_PUERTO=5433         puerto de la réplica en este servidor
#   REPLICA_ESCUCHA=127.0.0.1   dónde escucha la réplica (no exponer a internet sin firewall)
#   PG_USUARIO=postgres         superusuario de la BD de la planta (POSTGRES_USER del contenedor)
set -euo pipefail

CONF="${CONF:-$HOME/.config/planta-replica.env}"
# shellcheck disable=SC1090
[ -f "$CONF" ] && { set -a; . "$CONF"; set +a; }
: "${REPLICA_CLAVE:?Falta REPLICA_CLAVE en $CONF}"
TUNEL="${TUNEL_PUERTO:-15432}"
PUERTO="${REPLICA_PUERTO:-5433}"
ESCUCHA="${REPLICA_ESCUCHA:-127.0.0.1}"
USUARIO="${PG_USUARIO:-postgres}"
IMAGEN="${PG_IMAGEN:-postgres:18}"
NOMBRE=planta-replica
VOL=planta-replica-data
DATOS=/var/lib/postgresql/18/docker

if docker ps -a --format '{{.Names}}' | grep -qx "$NOMBRE"; then
  echo "Ya existe el contenedor $NOMBRE. Para rehacer la réplica desde cero:"
  echo "  docker rm -f $NOMBRE && docker volume rm $VOL && $0"
  exit 1
fi

echo "1/3 Copiando la base completa de la planta por el túnel (puede tardar)..."
docker volume create "$VOL" >/dev/null
docker run --rm --network host -u postgres -e PGPASSWORD="$REPLICA_CLAVE" -v "$VOL:/var/lib/postgresql" "$IMAGEN" \
  pg_basebackup -h 127.0.0.1 -p "$TUNEL" -U replicador -D "$DATOS" -S nube -X stream -R -c fast -P

echo "2/3 Configurando la conexión con la planta..."
docker run --rm -u postgres -e REPLICA_CLAVE -e TUNEL="$TUNEL" -e DATOS="$DATOS" -v "$VOL:/var/lib/postgresql" "$IMAGEN" \
  sh -c 'cat >> "$DATOS/postgresql.auto.conf" <<EOF
primary_conninfo = '"'"'host=127.0.0.1 port=$TUNEL user=replicador password=$REPLICA_CLAVE application_name=nube'"'"'
primary_slot_name = '"'"'nube'"'"'
EOF
touch "$DATOS/standby.signal"'

echo "3/3 Arrancando la réplica..."
docker run -d --name "$NOMBRE" --restart unless-stopped --network host -v "$VOL:/var/lib/postgresql" "$IMAGEN" \
  -c port="$PUERTO" -c listen_addresses="$ESCUCHA" -c hot_standby=on -c hot_standby_feedback=on >/dev/null

for _ in $(seq 1 30); do
  docker exec "$NOMBRE" pg_isready -q -p "$PUERTO" && break
  sleep 2
done
docker exec -u postgres "$NOMBRE" psql -p "$PUERTO" -U "$USUARIO" -d postgres -c \
  "SELECT pg_is_in_recovery() AS es_replica, status, now() - pg_last_xact_replay_timestamp() AS retraso FROM pg_stat_wal_receiver"
echo "Si es_replica = t y status = streaming, la réplica quedó funcionando."
