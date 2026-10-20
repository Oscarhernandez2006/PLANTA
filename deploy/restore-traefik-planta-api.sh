#!/usr/bin/env bash
# Dokploy deja vacías las etiquetas de Traefik del servicio de la API: se agregan a mano
# (igual que en SIGCOM / SIGCOMPRO). Las estaciones de planta se conectan por IP y HTTP
# (http://192.168.1.249/api), sin dominio ni certificado.
#
# Uso en el servidor (192.168.1.249, usuario svradmin; docker requiere sudo):
#   bash deploy/restore-traefik-planta-api.sh [nombre-del-servicio]
#   Sin nombre usa el servicio de la API en Dokploy. Para verlo: sudo docker service ls
set -euo pipefail

SERVICE="${1:-planta-de-software-backend-planta-zgkqh7}"
HOST="${HOST:-192.168.1.249}"
DOCKER="docker"
[ "$(id -u)" -ne 0 ] && DOCKER="sudo docker"

if ! $DOCKER service inspect "$SERVICE" >/dev/null 2>&1; then
  echo "No existe el servicio ${SERVICE}. Servicios disponibles:" >&2
  $DOCKER service ls --format '  {{.Name}}' >&2
  echo "Uso: bash $0 <nombre-del-servicio>" >&2
  exit 1
fi

$DOCKER service update \
  --label-add 'traefik.enable=true' \
  --label-add "traefik.http.routers.planta-api.rule=Host(\`${HOST}\`)" \
  --label-add 'traefik.http.routers.planta-api.entrypoints=web' \
  --label-add 'traefik.http.routers.planta-api.service=planta-api' \
  --label-add 'traefik.http.services.planta-api.loadbalancer.server.port=3000' \
  --label-add 'traefik.docker.network=dokploy-network' \
  "$SERVICE"

echo "Etiquetas aplicadas a ${SERVICE}. Prueba: http://${HOST}/api/health"
