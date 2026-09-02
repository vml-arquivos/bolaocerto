#!/bin/bash
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERRO: DATABASE_URL nao foi configurada." >&2
  exit 1
fi

echo "BL - Bolao Livre: aplicando migracoes do banco..."
pnpm --filter @bolaocerto/api prisma:migrate

echo "BL - Bolao Livre: preparando dados iniciais..."
pnpm --filter @bolaocerto/api prisma:seed

shutdown() {
  trap - TERM INT EXIT
  kill -TERM "$api_pid" "$worker_pid" "$web_pid" 2>/dev/null || true
  wait "$api_pid" "$worker_pid" "$web_pid" 2>/dev/null || true
}

trap shutdown TERM INT EXIT

echo "BL - Bolao Livre: iniciando API interna..."
PORT="${API_PORT:-3001}" node apps/api/dist/main.js &
api_pid=$!

echo "BL - Bolao Livre: iniciando atualizador de concursos..."
node apps/worker/dist/main.js &
worker_pid=$!

echo "BL - Bolao Livre: iniciando aplicacao web..."
PORT="${APP_PORT:-3000}" HOSTNAME=0.0.0.0 node apps/web/server.js &
web_pid=$!

# Encerra todo o container se qualquer processo essencial parar.
wait -n "$api_pid" "$worker_pid" "$web_pid"
exit_code=$?
echo "Um processo do BL foi encerrado (codigo ${exit_code}). Encerrando o container..." >&2
exit "$exit_code"
