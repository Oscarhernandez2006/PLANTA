#!/usr/bin/env bash
# Estado de la réplica en la nube, visto desde la PLANTA. Para cron cada 5 minutos:
#   */5 * * * * $HOME/ops/replica-estado.sh >> $HOME/backups/cron.log 2>&1
# Escribe en ~/backups/replica.log y sale con error si la nube no está recibiendo cambios.
set -uo pipefail

CONF="${CONF:-$HOME/.config/planta-respaldo.env}"
# shellcheck disable=SC1090
[ -f "$CONF" ] && { set -a; . "$CONF"; set +a; }
SERVICIO="${LOCAL_SERVICIO:-planta-de-software-db-local}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups}"
LOG="$BACKUP_ROOT/replica.log"
mkdir -p "$BACKUP_ROOT"
log() { echo "$(date '+%F %T') $*" | tee -a "$LOG"; }

id="$(docker ps --filter "name=$SERVICIO" --format '{{.ID}}' | head -1)"
[ -n "$id" ] || { log "ERROR no está corriendo el contenedor $SERVICIO"; exit 1; }
usuario="$(docker exec "$id" sh -c 'echo "${POSTGRES_USER:-postgres}"')"
bd="$(docker exec "$id" sh -c 'echo "${POSTGRES_DB:-$POSTGRES_USER}"')"

fila="$(docker exec -u postgres "$id" psql -U "$usuario" -d "$bd" -AtF '|' -c "
  SELECT s.active,
         coalesce(r.state, 'desconectada'),
         coalesce(extract(epoch FROM r.replay_lag)::int, 0),
         pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), s.restart_lsn)),
         s.wal_status
  FROM pg_replication_slots s
  LEFT JOIN pg_stat_replication r ON r.pid = s.active_pid
  WHERE s.slot_name = 'nube'")"
[ -n "$fila" ] || { log "ERROR no existe el slot \"nube\" (corre replica-preparar-planta.sh)"; exit 1; }
IFS='|' read -r activo estado retraso pendiente wal <<<"$fila"

error=0
if [ "$activo" = "t" ] && [ "$estado" = "streaming" ]; then
  log "OK   réplica al día (retraso ${retraso}s, pendiente $pendiente)"
else
  log "ALERTA la nube NO está recibiendo cambios: $estado, pendiente $pendiente, wal $wal (revisa: systemctl status planta-tunel-replica)"
  [ "$wal" = "lost" ] && log "ALERTA se superó REPLICA_WAL_MAX: hay que rehacer la réplica (replica-crear-nube.sh)"
  error=1
fi

# Slot "archivo": registro de cambios para la recuperación a un momento exacto (pitr-archivo-nube.sh).
arch="$(docker exec -u postgres "$id" psql -U "$usuario" -d "$bd" -AtF '|' -c "
  SELECT active, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)), wal_status
  FROM pg_replication_slots WHERE slot_name = 'archivo'")"
if [ -n "$arch" ]; then
  IFS='|' read -r activo pendiente wal <<<"$arch"
  if [ "$activo" = "t" ]; then
    log "OK   registro de cambios al día (pendiente $pendiente)"
  else
    log "ALERTA el registro de cambios de la nube está detenido: pendiente $pendiente, wal $wal (revisa en la nube: docker logs planta-wal)"
    error=1
  fi
fi
exit "$error"
