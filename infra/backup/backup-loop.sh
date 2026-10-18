#!/bin/sh
# Roda o backup ao subir e depois a cada BACKUP_INTERVAL_HOURS (padrão 24).
set -u
command -v curl >/dev/null 2>&1 || apk add --no-cache curl >/dev/null 2>&1 || true
INTERVAL="$(( ${BACKUP_INTERVAL_HOURS:-24} * 3600 ))"
sleep 60
while true; do
  /bin/sh /scripts/backup.sh || echo "[backup] ciclo falhou; tentando de novo no próximo intervalo"
  sleep "$INTERVAL"
done
