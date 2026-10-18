#!/bin/sh
# Prova que o backup restaura: carrega o dump mais recente num banco TEMPORÁRIO e confere as tabelas principais.
# Uso (no servidor):  docker compose -f docker-compose.production.yml exec backup /bin/sh /scripts/restore-check.sh [arquivo.sql.gz]
set -eu
DIR="${BACKUP_DIR:-/backups}"
FILE="${1:-$(ls -1t "$DIR"/bl-*.sql.gz 2>/dev/null | head -n 1)}"
[ -n "$FILE" ] && [ -f "$FILE" ] || { echo "Nenhum backup encontrado em $DIR"; exit 1; }
TMPDB="bl_restore_check_$$"
echo "Restaurando $FILE em $TMPDB ..."
createdb "$TMPDB"
trap 'dropdb --if-exists "$TMPDB" >/dev/null 2>&1 || true' EXIT
gunzip -c "$FILE" | psql -q -v ON_ERROR_STOP=1 -d "$TMPDB" >/dev/null
for table in usuarios boloes cotas pagamentos concursos resultados; do
  COUNT="$(psql -tA -d "$TMPDB" -c "SELECT count(*) FROM $table")"
  echo "  $table: $COUNT linha(s)"
done
echo "OK: o backup restaura corretamente."
