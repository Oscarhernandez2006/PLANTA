#!/usr/bin/env bash
# Recuperación a un momento exacto (instalación, en la NUBE). Correr una sola vez:
#   - contenedor planta-wal: guarda en tiempo real cada cambio de la planta (WAL) por el túnel,
#     usando el slot "archivo" (si el túnel se cae, la planta guarda los cambios hasta que vuelva);
#   - cron diario con pitr-base-nube.sh (copia base) y la primera copia base.
# Requiere la réplica funcionando (replica-crear-nube.sh). Usa ~/.config/planta-replica.env:
#   REPLICA_CLAVE, TUNEL_PUERTO, REPLICA_PUERTO, PG_USUARIO
#   PITR_DIAS=15         días hacia atrás a los que se puede volver
set -euo pipefail

CONF="${CONF:-$HOME/.config/planta-replica.env}"
# shellcheck disable=SC1090
[ -f "$CONF" ] && { set -a; . "$CONF"; set +a; }
: "${REPLICA_CLAVE:?Falta REPLICA_CLAVE en $CONF}"
TUNEL="${TUNEL_PUERTO:-15432}"
IMAGEN="${PG_IMAGEN:-postgres:18}"
VOL=planta-pitr
NOMBRE=planta-wal
DIR_SCRIPTS="$(cd "$(dirname "$0")" && pwd)"

docker volume create "$VOL" >/dev/null
docker run --rm -v "$VOL:/pitr" "$IMAGEN" sh -c 'mkdir -p /pitr/wal /pitr/base && chown -R postgres:postgres /pitr'

if docker ps -a --format '{{.Names}}' | grep -qx "$NOMBRE"; then
  echo "El contenedor $NOMBRE ya existe."
else
  docker run -d --name "$NOMBRE" --restart unless-stopped --network host -u postgres \
    -e PGPASSWORD="$REPLICA_CLAVE" -e TUNEL="$TUNEL" -v "$VOL:/pitr" "$IMAGEN" \
    sh -c 'pg_receivewal -h 127.0.0.1 -p "$TUNEL" -U replicador -S archivo --create-slot --if-not-exists &&
           exec pg_receivewal -h 127.0.0.1 -p "$TUNEL" -U replicador -S archivo -D /pitr/wal --synchronous' >/dev/null
fi
sleep 5
docker ps --filter "name=$NOMBRE" --format '{{.Names}}: {{.Status}}'
docker exec "$NOMBRE" ls /pitr/wal | tail -3

( crontab -l 2>/dev/null | grep -v pitr-base-nube.sh
  echo "0 3 * * * $DIR_SCRIPTS/pitr-base-nube.sh >> $HOME/pitr.log 2>&1" ) | crontab -
echo "Cron: copia base diaria a las 03:00 (hora del servidor)."

"$DIR_SCRIPTS/pitr-base-nube.sh"
