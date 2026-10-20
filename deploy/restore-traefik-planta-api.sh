#!/usr/bin/env bash
# Dokploy deja vacías las etiquetas de Traefik del servicio de la API: se agregan a mano
# (igual que en SIGCOM / SIGCOMPRO). Las estaciones de planta se conectan por IP y HTTP
# (http://192.168.1.249/api), sin dominio ni certificado.
#
# Uso en el servidor: bash deploy/restore-traefik-planta-api.sh <nombre-del-servicio>
#   El nombre sale de:  docker service ls   (el de la API de Planta Bovino)
set -euo pipefail

SERVICE="${1:-}"
HOST="${HOST:-192.168.1.249}"

if [ -z "$SERVICE" ]; then
  echo "Falta el nombre del servicio. Servicios disponibles:" >&2
  docker service ls --format '  {{.Name}}' >&2
  echo "Uso: bash $0 <nombre-del-servicio>" >&2
  exit 1
fi

docker service update \
  --label-add 'traefik.enable=true' \
  --label-add "traefik.http.routers.planta-api.rule=Host(\`${HOST}\`)" \
  --label-add 'traefik.http.routers.planta-api.entrypoints=web' \
  --label-add 'traefik.http.routers.planta-api.service=planta-api' \
  --label-add 'traefik.http.services.planta-api.loadbalancer.server.port=3000' \
  --label-add 'traefik.docker.network=dokploy-network' \
  "$SERVICE"

echo "Etiquetas aplicadas a ${SERVICE}. Prueba: http://${HOST}/api/health"
