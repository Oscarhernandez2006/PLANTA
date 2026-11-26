#!/usr/bin/env bash
# Réplica en tiempo real (paso 1, en el servidor de la PLANTA): deja la BD local lista para
# replicar a la nube. No borra ni modifica datos; solo crea:
#   - el usuario "replicador" (solo replicación),
#   - el slot de replicación "nube" (guarda los cambios si el túnel se cae),
#   - la regla en pg_hba.conf para que el replicador entre por el túnel.
# Se puede correr varias veces (si ya existe, lo deja igual y actualiza la clave).
#
# Configuración en ~/.config/planta-respaldo.env (chmod 600):
#   REPLICA_CLAVE=<solo letras y números; ej. openssl rand -hex 24>
#   REPLICA_WAL_MAX=20GB     tope de cambios guardados si la nube no se conecta (protege el disco)
set -euo pipefail

CONF="${CONF:-$HOME/.config/planta-respaldo.env}"
# shellcheck disable=SC1090
[ -f "$CONF" ] && { set -a; . "$CONF"; set +a; }
: "${REPLICA_CLAVE:?Falta REPLICA_CLAVE en $CONF}"
[[ "$REPLICA_CLAVE" =~ ^[A-Za-z0-9]{16,}$ ]] || { echo "REPLICA_CLAVE debe tener 16+ letras/números"; exit 1; }
SERVICIO="${LOCAL_SERVICIO:-planta-de-software-db-local}"
WAL_MAX="${REPLICA_WAL_MAX:-20GB}"

id="$(docker ps --filter "name=$SERVICIO" --format '{{.ID}}' | head -1)"
[ -n "$id" ] || { echo "No está corriendo el contenedor $SERVICIO"; exit 1; }
usuario="$(docker exec "$id" sh -c 'echo "${POSTGRES_USER:-postgres}"')"
bd="$(docker exec "$id" sh -c 'echo "${POSTGRES_DB:-$POSTGRES_USER}"')"
psql_() { docker exec -i -u postgres -e REPLICA_CLAVE -e WAL_MAX="$WAL_MAX" "$id" psql -v ON_ERROR_STOP=1 -U "$usuario" -d "$bd" -At "$@"; }

nivel="$(psql_ -c 'SHOW wal_level')"
if [ "$nivel" = "minimal" ]; then
  echo "wal_level=minimal: agrega '-c wal_level=replica' al comando del contenedor en Dokploy y reinícialo."
  exit 1
fi

psql_ <<'SQL'
\getenv clave REPLICA_CLAVE
\getenv walmax WAL_MAX
SELECT 'CREATE ROLE replicador WITH REPLICATION LOGIN'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'replicador') \gexec
SELECT format('ALTER ROLE replicador WITH REPLICATION LOGIN PASSWORD %L', :'clave') \gexec
SELECT pg_create_physical_replication_slot('nube')
WHERE NOT EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = 'nube');
SELECT format('ALTER SYSTEM SET max_slot_wal_keep_size = %L', :'walmax') \gexec
SQL

hba="$(psql_ -c 'SHOW hba_file')"
docker exec -u postgres -e HBA="$hba" "$id" sh -c '
  grep -q "^host[[:space:]]\+replication[[:space:]]\+replicador" "$HBA" ||
  printf "\n# Réplica en la nube (entra por el túnel SSH)\nhost replication replicador all scram-sha-256\n" >> "$HBA"'
psql_ -c 'SELECT pg_reload_conf()' >/dev/null

echo "Listo: usuario replicador, slot \"nube\" y pg_hba configurados en $bd (wal_level=$nivel, tope WAL $WAL_MAX)."
echo "Siguiente: ./replica-tunel-planta.sh"
