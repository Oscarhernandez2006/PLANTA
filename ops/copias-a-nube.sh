#!/usr/bin/env bash
# Capa 3 — Sube a la máquina de la nube las copias locales (.dump) que hace backup-postgres.sh
# y aplica la retención allá: 30 días + la copia del día 1 de cada mes (00:30) para siempre.
# Pensado para correr por cron cada 2 h, después de backup-postgres.sh.
#
# Configuración en ~/.config/planta-respaldo.env:
#   NUBE_SSH=usuario@20.121.178.90
#   NUBE_SSH_PUERTO=22
#   NUBE_SSH_LLAVE=/home/svradmin/.ssh/respaldo_nube
#   NUBE_DIR=respaldos-planta
set -uo pipefail

CONF="${CONF:-$HOME/.config/planta-respaldo.env}"
# shellcheck disable=SC1090
[ -f "$CONF" ] && { set -a; . "$CONF"; set +a; }
: "${NUBE_SSH:?Falta NUBE_SSH en $CONF}"
PUERTO="${NUBE_SSH_PUERTO:-22}"
LLAVE="${NUBE_SSH_LLAVE:-$HOME/.ssh/respaldo_nube}"
REMOTO="${NUBE_DIR:-respaldos-planta}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups}"
ORIGEN="$BACKUP_ROOT/planta-de-software-db-local"
DIAS="${NUBE_RETENCION_DIAS:-30}"
LOG="$BACKUP_ROOT/copias-nube.log"
log() { echo "$(date '+%F %T') $*" | tee -a "$LOG"; }

SSH=(ssh -i "$LLAVE" -p "$PUERTO" -o BatchMode=yes -o ConnectTimeout=20)

[ -d "$ORIGEN" ] || { log "ERROR no existe $ORIGEN"; exit 1; }

if ! "${SSH[@]}" "$NUBE_SSH" "mkdir -p '$REMOTO'" 2>>"$LOG"; then
  log "ERROR no hay conexión SSH con $NUBE_SSH"
  exit 1
fi

# Solo agrega archivos nuevos: nunca borra en la nube lo que la rotación local ya eliminó.
if rsync -a --ignore-existing -e "ssh -i $LLAVE -p $PUERTO -o BatchMode=yes -o ConnectTimeout=20" \
  "$ORIGEN/" "$NUBE_SSH:$REMOTO/" 2>>"$LOG"; then
  :
else
  log "ERROR rsync falló"
  exit 1
fi

"${SSH[@]}" "$NUBE_SSH" \
  "find '$REMOTO' -name '*.dump' -mtime +$DIAS ! -name '*-01_0030.dump' -delete; \
   echo \"\$(ls '$REMOTO'/*.dump 2>/dev/null | wc -l) copias, \$(du -sh '$REMOTO' | cut -f1)\"" \
  > /tmp/copias-nube.$$ 2>>"$LOG"
log "OK   copias en la nube: $(cat /tmp/copias-nube.$$ 2>/dev/null)"
rm -f /tmp/copias-nube.$$
