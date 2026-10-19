#!/bin/sh
# Backup lógico do Postgres (pg_dump + gzip), com verificação e retenção.
# Variáveis: PGHOST PGUSER PGPASSWORD PGDATABASE (obrigatórias), BACKUP_DIR (/backups), BACKUP_KEEP_DAYS (14).
set -eu
: "${PGHOST:?PGHOST obrigatoria}" "${PGUSER:?PGUSER obrigatoria}" "${PGPASSWORD:?PGPASSWORD obrigatoria}" "${PGDATABASE:?PGDATABASE obrigatoria}"
DIR="${BACKUP_DIR:-/backups}"
KEEP="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$DIR"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="$DIR/bl-$STAMP.sql.gz"
TMP="$OUT.partial"

notify_failure() {
  echo "[backup] FALHA: $1" >&2
  if [ -n "${ALERT_WEBHOOK_URL:-}" ] && command -v curl >/dev/null 2>&1; then
    MSG="[${ALERT_ENV_LABEL:-BL}] Backup do banco FALHOU: $1"
    curl -fsS -m 10 -H 'Content-Type: application/json' -d "{\"text\":\"$MSG\",\"content\":\"$MSG\"}" "$ALERT_WEBHOOK_URL" >/dev/null 2>&1 || true
  fi
}

# (sem pipe: no sh puro o código de saída seria o do gzip e esconderia a falha do pg_dump)
if ! pg_dump --no-owner --clean --if-exists "$PGDATABASE" > "$TMP.sql"; then rm -f "$TMP.sql"; notify_failure "pg_dump retornou erro (banco fora do ar ou credenciais erradas)"; exit 1; fi
gzip -9 < "$TMP.sql" > "$TMP"; rm -f "$TMP.sql"
# Verifica: arquivo íntegro e com tamanho plausível (um dump vazio pesa ~20 bytes).
if ! gzip -t "$TMP" 2>/dev/null || [ "$(wc -c < "$TMP")" -lt 2000 ]; then rm -f "$TMP"; notify_failure "arquivo gerado inválido ou vazio"; exit 1; fi
mv "$TMP" "$OUT"
echo "[backup] ok: $OUT ($(wc -c < "$OUT") bytes)"
# Arquivos enviados (comprovantes/recibos), se a pasta estiver montada em /uploads.
UPLOADS="${UPLOADS_DIR:-/uploads}"
if [ -d "$UPLOADS" ] && [ -n "$(ls -A "$UPLOADS" 2>/dev/null)" ]; then
  FILES_OUT="$DIR/bl-arquivos-$STAMP.tar.gz"
  if tar -czf "$FILES_OUT.partial" -C "$UPLOADS" . 2>/dev/null && gzip -t "$FILES_OUT.partial" 2>/dev/null; then
    mv "$FILES_OUT.partial" "$FILES_OUT"; echo "[backup] ok: $FILES_OUT ($(wc -c < "$FILES_OUT") bytes)"
  else
    rm -f "$FILES_OUT.partial"; notify_failure "não foi possível copiar os arquivos enviados (comprovantes)"
  fi
fi
# Retenção
find "$DIR" \( -name 'bl-*.sql.gz' -o -name 'bl-arquivos-*.tar.gz' \) -mtime +"$KEEP" -print -delete 2>/dev/null || true
