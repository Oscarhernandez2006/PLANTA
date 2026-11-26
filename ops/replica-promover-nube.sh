#!/usr/bin/env bash
# EMERGENCIA (en la NUBE): convierte la réplica en base principal (lectura y escritura) cuando
# la planta se perdió. Después de esto la réplica deja de seguir a la planta para siempre:
# para volver a la planta se restaura la planta desde aquí y se rehace la réplica.
set -euo pipefail

CONF="${CONF:-$HOME/.config/planta-replica.env}"
# shellcheck disable=SC1090
[ -f "$CONF" ] && { set -a; . "$CONF"; set +a; }
PUERTO="${REPLICA_PUERTO:-5433}"
USUARIO="${PG_USUARIO:-postgres}"

echo "La réplica dejará de recibir cambios de la planta y pasará a ser la base principal."
read -rp "Escribe PROMOVER para continuar: " ok
[ "$ok" = "PROMOVER" ] || { echo "Cancelado."; exit 1; }

docker exec -u postgres planta-replica psql -p "$PUERTO" -U "$USUARIO" -d postgres -c "SELECT pg_promote()"
docker exec -u postgres planta-replica psql -p "$PUERTO" -U "$USUARIO" -d postgres -Atc "SELECT pg_is_in_recovery()" |
  grep -qx f && echo "Listo: la base de la nube ahora es la principal (puerto $PUERTO)."
