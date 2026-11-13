#!/usr/bin/env bash
# Restaura la BD local de la planta con el espejo que está en la nube (si la local se dañó).
# Antes de tocar nada guarda una copia de la BD local actual y detiene el backend.
#
# Uso:  ./restaurar-desde-nube.sh
# Usa la misma configuración que espejo-nube.sh (~/.config/planta-respaldo.env) y además:
#   BACKEND_SERVICIO=planta-de-software-backend-planta-zgkqh7
set -euo pipefail

CONF="${CONF:-$HOME/.config/planta-respaldo.env}"
# shellcheck disable=SC1090
[ -f "$CONF" ] && { set -a; . "$CONF"; set +a; }
: "${NUBE_URL:?Falta NUBE_URL en $CONF}"
SERVICIO="${LOCAL_SERVICIO:-planta-de-software-db-local}"
BACKEND="${BACKEND_SERVICIO:-}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups}"
IMAGEN="${PG_IMAGEN:-postgres:18}"

DIR="$BACKUP_ROOT/espejo-nube"
LOG="$BACKUP_ROOT/espejo-nube.log"
mkdir -p "$DIR"
log() { echo "$(date '+%F %T') $*" | tee -a "$LOG"; }

exec 9>"$DIR/.lock"
flock -n 9 || { echo "Hay un envío a la nube en curso. Intenta en unos minutos."; exit 1; }

id="$(docker ps --filter "name=$SERVICIO" --format '{{.ID}}' | head -1)"
[ -n "$id" ] || { echo "No está corriendo el contenedor $SERVICIO"; exit 1; }
usuario="$(docker exec "$id" sh -c 'echo "${POSTGRES_USER:-postgres}"')"
bd="$(docker exec "$id" sh -c 'echo "${POSTGRES_DB:-$POSTGRES_USER}"')"

echo "Se va a REEMPLAZAR la base local \"$bd\" con la copia que está en la nube."
read -rp "Escribe RESTAURAR para continuar: " ok
[ "$ok" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }

stamp="$(date '+%F_%H%M')"
log "Restauración desde la nube iniciada"

echo "1/4 Bajando la copia de la nube..."
docker run --rm -e NUBE_URL -e PGCONNECT_TIMEOUT=20 "$IMAGEN" \
  sh -c 'pg_dump -Fc -d "$NUBE_URL"' > "$DIR/desde-nube_$stamp.dump"

echo "2/4 Guardando copia de seguridad de la base local actual..."
docker exec "$id" pg_dump -U "$usuario" -d "$bd" -Fc > "$DIR/antes-de-restaurar_$stamp.dump" \
  || echo "   (no se pudo copiar la base local; puede estar dañada, se continúa)"

if [ -n "$BACKEND" ]; then
  echo "3/4 Deteniendo el backend ($BACKEND)..."
  docker service scale "$BACKEND=0" >/dev/null
fi

echo "4/4 Restaurando en la base local..."
if docker exec -i "$id" pg_restore -U "$usuario" -d "$bd" --clean --if-exists --no-owner --no-privileges \
  --single-transaction --exit-on-error < "$DIR/desde-nube_$stamp.dump"; then
  log "OK   base local restaurada desde la nube (copia previa: antes-de-restaurar_$stamp.dump)"
  resultado=0
else
  log "ERROR falló la restauración; la base local quedó como estaba"
  resultado=1
fi

if [ -n "$BACKEND" ]; then
  docker service scale "$BACKEND=1" >/dev/null
  echo "Backend encendido de nuevo."
fi
exit "$resultado"
