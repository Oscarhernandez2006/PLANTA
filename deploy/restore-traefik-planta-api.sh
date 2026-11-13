sudo docker service update \
  --label-add 'traefik.enable=true' \
  --label-add 'traefik.http.routers.planta-api.rule=Host(`192.168.1.249`)' \
  --label-add 'traefik.http.routers.planta-api.entrypoints=web' \
  --label-add 'traefik.http.routers.planta-api.service=planta-api' \
  --label-add 'traefik.http.services.planta-api.loadbalancer.server.port=3000' \
  --label-add 'traefik.docker.network=dokploy-network' \
  planta-de-software-backend-planta-zgkqh7

curl http://192.168.1.249/api/health