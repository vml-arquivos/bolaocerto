#!/bin/bash
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERRO: DATABASE_URL nao foi configurada." >&2
  exit 1
fi

echo "BL - Bolao Livre: aplicando migracoes do banco..."
./apps/api/node_modules/.bin/prisma migrate deploy --schema apps/api/prisma/schema.prisma

echo "BL - Bolao Livre: preparando dados iniciais..."
(cd apps/api && node --import tsx prisma/seed.ts)

api_pid=""
worker_pid=""
web_pid=""
shutting_down=0

shutdown() {
  if [ "$shutting_down" -eq 1 ]; then return; fi
  shutting_down=1
  trap - TERM INT EXIT
  for pid in "$api_pid" "$worker_pid" "$web_pid"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done
  for pid in "$api_pid" "$worker_pid" "$web_pid"; do
    if [ -n "$pid" ]; then wait "$pid" 2>/dev/null || true; fi
  done
}

trap shutdown TERM INT

fail_fast() {
  local exit_code="$1"
  echo "Um processo essencial do BL foi encerrado (codigo ${exit_code}). Encerrando o container..." >&2
  shutdown
  exit "$exit_code"
}

trap 'status=$?; if [ "$status" -ne 0 ] && [ "$shutting_down" -eq 0 ]; then fail_fast "$status"; fi' EXIT

echo "BL - Bolao Livre: iniciando API interna..."
PORT="${API_PORT:-3001}" node apps/api/dist/main.js &
api_pid=$!

echo "BL - Bolao Livre: iniciando atualizador de concursos..."
node apps/worker/dist/main.js &
worker_pid=$!

echo "BL - Bolao Livre: iniciando aplicacao web..."
PORT="${APP_PORT:-3000}" HOSTNAME=0.0.0.0 node apps/web/server.js &
web_pid=$!

# wait -n retorna quando qualquer processo essencial para; o codigo original e propagado.
set +e
wait -n "$api_pid" "$worker_pid" "$web_pid"
exit_code=$?
set -e
fail_fast "$exit_code"
