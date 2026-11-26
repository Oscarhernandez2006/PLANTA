#!/usr/bin/env bash
# Réplica en tiempo real (paso 2, en el servidor de la PLANTA): túnel SSH permanente
# planta -> nube. La planta está detrás de NAT, así que es ella la que abre la conexión y
# publica su PostgreSQL en la nube como 127.0.0.1:<TUNEL_PUERTO>. Si se cae, systemd lo
# reabre en 10 s; mientras tanto el slot "nube" guarda los cambios y la réplica se pone al día sola.
#
# Usa la misma llave SSH de copias-a-nube.sh (~/.config/planta-respaldo.env):
#   NUBE_SSH=usuario@20.121.178.90
#   NUBE_SSH_PUERTO=22
#   NUBE_SSH_LLAVE=/home/svradmin/.ssh/respaldo_nube
#   TUNEL_PUERTO=15432        puerto en la nube (solo 127.0.0.1)
#   LOCAL_PG_PUERTO=5432      puerto publicado de la BD local en este servidor
set -euo pipefail

CONF="${CONF:-$HOME/.config/planta-respaldo.env}"
# shellcheck disable=SC1090
[ -f "$CONF" ] && { set -a; . "$CONF"; set +a; }
: "${NUBE_SSH:?Falta NUBE_SSH en $CONF}"
PUERTO="${NUBE_SSH_PUERTO:-22}"
LLAVE="${NUBE_SSH_LLAVE:-$HOME/.ssh/respaldo_nube}"
TUNEL="${TUNEL_PUERTO:-15432}"
LOCAL="${LOCAL_PG_PUERTO:-5432}"
UNIDAD=planta-tunel-replica

ssh -i "$LLAVE" -p "$PUERTO" -o BatchMode=yes -o ConnectTimeout=20 "$NUBE_SSH" true ||
  { echo "No hay SSH sin clave hacia $NUBE_SSH con $LLAVE (revisa copias-a-nube.sh)."; exit 1; }

sudo tee "/etc/systemd/system/$UNIDAD.service" >/dev/null <<EOF
[Unit]
Description=Túnel SSH planta -> nube para la réplica de PostgreSQL
After=network-online.target docker.service
Wants=network-online.target

[Service]
User=$(id -un)
ExecStart=/usr/bin/ssh -N -i $LLAVE -p $PUERTO -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -R 127.0.0.1:$TUNEL:127.0.0.1:$LOCAL $NUBE_SSH
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now "$UNIDAD"
sleep 3
systemctl --no-pager status "$UNIDAD" | head -5
echo "Siguiente (en la NUBE): ./replica-crear-nube.sh"
