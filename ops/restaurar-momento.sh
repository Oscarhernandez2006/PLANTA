#!/usr/bin/env bash
# Devuelve la BD local de la PLANTA al estado exacto de un momento (por ejemplo, un minuto antes
# de un borrado o de una migración que dañó datos). La nube arma la base de ese momento
# (pitr-restaurar-nube.sh), muestra qué tablas cambian y, si se confirma, se reemplaza la local.
# Antes guarda una copia de la base actual y detiene el backend mientras restaura.
# Todo lo digitado DESPUÉS de esa hora se pierde: detén la operación apenas notes el problema.
#
# Uso:  ./restaurar-momento.sh                       desde cuándo se puede volver
#       ./restaurar-momento.sh "2026-11-26 10:41"    hora de Colombia
# Usa ~/.config/planta-respaldo.env (NUBE_SSH, NUBE_SSH_PUERTO, NUBE_SSH_LLAVE, LOCAL_SERVICIO,
# BACKEND_SERVICIO, BACKUP_ROOT).
set -euo pipefail

CONF="${CONF:-$HOME/.config/planta-respaldo.env}"
# shellcheck disable=SC1090
[ -f "$CONF" ] && { set -a; . "$CONF"; set +a; }
: "${NUBE_SSH:?Falta NUBE_SSH en $CONF}"
PUERTO="${NUBE_SSH_PUERTO:-22}"
LLAVE="${NUBE_SSH_LLAVE:-$HOME/.ssh/respaldo_nube}"
SERVICIO="${LOCAL_SERVICIO:-planta-de-software-db-local}"
BACKEND="${BACKEND_SERVICIO:-}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups}"
DIR="$BACKUP_ROOT/restauraciones"
LOG="$DIR/restauraciones.log"
mkdir -p "$DIR"
log() { echo "$(date '+%F %T') $*" | tee -a "$LOG"; }
SSH=(ssh -n -i "$LLAVE" -p "$PUERTO" -o BatchMode=yes -o ConnectTimeout=20 "$NUBE_SSH")

if [ $# -eq 0 ]; then
  "${SSH[@]}" 'bin/pitr-restaurar-nube.sh'
  echo "Uso: $0 \"AAAA-MM-DD HH:MM\""
  exit 0
fi
objetivo="$*"
[[ "$objetivo" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}\ [0-9]{2}:[0-9]{2}(:[0-9]{2})?$ ]] ||
  { echo "Formato: \"AAAA-MM-DD HH:MM\" (ej. \"2026-11-26 10:41\")"; exit 1; }

exec 9>"$DIR/.lock"
flock -n 9 || { echo "Ya hay una restauración en curso."; exit 1; }

id="$(docker ps --filter "name=$SERVICIO" --format '{{.ID}}' | head -1)"
[ -n "$id" ] || { echo "No está corriendo el contenedor $SERVICIO"; exit 1; }
usuario="$(docker exec "$id" sh -c 'echo "${POSTGRES_USER:-postgres}"')"
bd="$(docker exec "$id" sh -c 'echo "${POSTGRES_DB:-$POSTGRES_USER}"')"

# Una transacción vacía deja una marca de hora en el registro de cambios: así la nube sabe
# que ya pasó el momento pedido aunque nadie esté digitando.
docker exec -u postgres "$id" psql -U "$usuario" -d "$bd" -Atc 'SELECT pg_current_xact_id()' >/dev/null
sleep 3

"${SSH[@]}" "bin/pitr-restaurar-nube.sh '$objetivo'" | tee "$DIR/.salida"
remoto="$(sed -n 's/^DUMP=//p' "$DIR/.salida" | tail -1)"
[ -n "$remoto" ] || { echo "La nube no pudo armar la base de ese momento; no se tocó nada."; exit 1; }
dump="$DIR/$(basename "$remoto")"
scp -q -i "$LLAVE" -P "$PUERTO" -o BatchMode=yes "$NUBE_SSH:$remoto" "$dump" </dev/null

echo
echo "Se va a REEMPLAZAR la base local \"$bd\" por la de $objetivo."
echo "Se pierde todo lo digitado después de esa hora."
read -rp "Escribe RESTAURAR para continuar: " ok
[ "$ok" = "RESTAURAR" ] || { echo "Cancelado. La base quedó como estaba ($dump queda guardado)."; exit 1; }

stamp="$(date '+%F_%H%M%S')"
log "Restauración al momento $objetivo iniciada"
docker exec "$id" pg_dump -U "$usuario" -d "$bd" -Fc > "$DIR/antes-de-restaurar_$stamp.dump" ||
  echo "   (no se pudo copiar la base actual; puede estar dañada, se continúa)"

[ -n "$BACKEND" ] && docker service scale "$BACKEND=0" >/dev/null
# Se borra y recrea el esquema completo dentro de la misma transacción: así también desaparecen
# tablas o columnas que haya creado una migración mala. Si algo falla, no cambia nada.
if { echo 'BEGIN;'; echo 'SET client_min_messages = warning;'; echo 'DROP SCHEMA public CASCADE;'; echo 'CREATE SCHEMA public;'
     docker exec -i "$id" pg_restore --no-owner --no-privileges -f - < "$dump"
     echo 'COMMIT;'; } | docker exec -i "$id" psql -v ON_ERROR_STOP=1 -q -U "$usuario" -d "$bd" >/dev/null; then
  log "OK   base local restaurada al $objetivo (copia previa: antes-de-restaurar_$stamp.dump)"
  resultado=0
else
  log "ERROR falló la restauración; la base local quedó como estaba"
  resultado=1
fi
[ -n "$BACKEND" ] && docker service scale "$BACKEND=1" >/dev/null && echo "Backend encendido de nuevo."
exit "$resultado"
