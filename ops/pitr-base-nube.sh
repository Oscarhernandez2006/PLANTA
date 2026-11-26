#!/usr/bin/env bash
# Recuperación a un momento exacto: copia base diaria (cron en la NUBE). Se saca de la réplica
# (no carga la planta ni el túnel) y aplica la retención: se borran las copias base con más de
# PITR_DIAS días (conservando la última de ellas, para poder volver a cualquier minuto de esos
# días) y los cambios (WAL) que ya no se necesitan.
set -euo pipefail

CONF="${CONF:-$HOME/.config/planta-replica.env}"
# shellcheck disable=SC1090
[ -f "$CONF" ] && { set -a; . "$CONF"; set +a; }
PUERTO="${REPLICA_PUERTO:-5433}"
USUARIO="${PG_USUARIO:-postgres}"
DIAS="${PITR_DIAS:-15}"
IMAGEN="${PG_IMAGEN:-postgres:18}"
VOL=planta-pitr

echo "$(date '+%F %T') copia base iniciada"
docker run --rm --network host -u postgres -e N="$(date -u +%Y%m%dT%H%M%SZ)" -e P="$PUERTO" -e U="$USUARIO" \
  -e DIAS="$DIAS" -v "$VOL:/pitr" "$IMAGEN" sh -c '
set -e
cd /pitr/base
rm -rf .tmp-*
pg_basebackup -h 127.0.0.1 -p "$P" -U "$U" -D ".tmp-$N" -Ft -z -X stream -c fast
date -u +%s > ".tmp-$N/fin"
mv ".tmp-$N" "$N"

ahora=$(date -u +%s)
viejas=$(for b in $(ls | sort); do
  [ $(( ahora - $(cat "$b/fin") )) -gt $(( DIAS * 86400 )) ] && echo "$b"; done || true)
echo "$viejas" | head -n -1 | while read -r b; do [ -n "$b" ] && rm -rf "$b"; done

primera=$(ls | sort | head -1)
wal=$(tar -xzOf "$primera/base.tar.gz" backup_label | sed -n "s/^START WAL LOCATION: .*(file \(.*\))$/\1/p")
[ -n "$wal" ] && pg_archivecleanup /pitr/wal "$wal"
echo "copias base: $(ls | wc -l) (desde $primera), cambios guardados: $(du -sh /pitr/wal | cut -f1)"
'
echo "$(date '+%F %T') copia base OK"
