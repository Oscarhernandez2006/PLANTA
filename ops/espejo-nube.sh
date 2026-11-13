#!/usr/bin/env bash
# Capa 1 — Espejo de la BD local de la planta en la nube.
# Saca un pg_dump de la BD local (contenedor de Dokploy) y lo restaura en la BD de la
# nube en UNA sola transacción: si algo falla, la nube conserva el espejo anterior.
# Pensado para correr por cron cada hora.
#
# Configuración (chmod 600): ~/.config/planta-respaldo.env
#   NUBE_URL=postgresql://usuario:clave@host:puerto/BD
#   LOCAL_SERVICIO=planta-de-software-db-local     (parte del nombre del contenedor)
#   BACKUP_ROOT=/home/svradmin/backups
set -euo pipefail

CONF="${CONF:-$HOME/.config/planta-respaldo.env}"
# shellcheck disable=SC1090
[ -f "$CONF" ] && { set -a; . "$CONF"; set +a; }
: "${NUBE_URL:?Falta NUBE_URL en $CONF}"
SERVICIO="${LOCAL_SERVICIO:-planta-de-software-db-local}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups}"
IMAGEN="${PG_IMAGEN:-postgres:18}"
# Si la copia local pesa menos que este % de la anterior, no se envía (BD local dañada o vacía).
MIN_PCT="${MIN_PCT:-50}"

DIR="$BACKUP_ROOT/espejo-nube"
LOG="$BACKUP_ROOT/espejo-nube.log"
mkdir -p "$DIR"
log() { echo "$(date '+%F %T') $*" | tee -a "$LOG"; }

# El mismo candado lo usa restaurar-desde-nube.sh: nunca corren a la vez.
exec 9>"$DIR/.lock"
flock -n 9 || { log "Ya hay un envío o una restauración en curso; se omite."; exit 0; }

if [ "$(timedatectl show -p NTPSynchronized --value 2>/dev/null)" = "no" ]; then
  log "AVISO el reloj del servidor no está sincronizado (NTP)."
fi

id="$(docker ps --filter "name=$SERVICIO" --format '{{.ID}}' | head -1)"
[ -n "$id" ] || { log "ERROR no está corriendo el contenedor $SERVICIO"; exit 1; }
usuario="$(docker exec "$id" sh -c 'echo "${POSTGRES_USER:-postgres}"')"
bd="$(docker exec "$id" sh -c 'echo "${POSTGRES_DB:-$POSTGRES_USER}"')"

archivo="$DIR/ultimo.dump"
inicio=$(date +%s)
if ! docker exec "$id" pg_dump -U "$usuario" -d "$bd" -Fc > "$archivo.tmp" 2>>"$LOG"; then
  rm -f "$archivo.tmp"
  log "ERROR pg_dump de la BD local falló"
  exit 1
fi

nuevo=$(stat -c %s "$archivo.tmp")
if [ -f "$archivo" ]; then
  anterior=$(stat -c %s "$archivo")
  if [ "$anterior" -gt 0 ] && [ $((nuevo * 100 / anterior)) -lt "$MIN_PCT" ]; then
    mv "$archivo.tmp" "$DIR/sospechoso_$(date '+%F_%H%M').dump"
    log "ALERTA la copia local ($nuevo B) es mucho menor que la anterior ($anterior B): NO se envió a la nube."
    exit 1
  fi
fi
mv "$archivo.tmp" "$archivo"

# La URL va por variable de entorno para que no aparezca en la lista de procesos.
if docker run --rm -i -e NUBE_URL -e PGCONNECT_TIMEOUT=20 "$IMAGEN" \
  sh -c 'pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --exit-on-error -d "$NUBE_URL"' \
  < "$archivo" 2>>"$LOG"; then
  log "OK   espejo $bd -> nube ($(du -h "$archivo" | cut -f1), $(( $(date +%s) - inicio )) s)"
else
  log "ERROR la restauración en la nube falló; la nube conserva el espejo anterior"
  exit 1
fi
