#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
if docker compose version >/dev/null 2>&1; then
  docker compose up -d --build
elif command -v docker-compose >/dev/null 2>&1; then
  docker-compose up -d --build
else
  echo "Docker Compose is required (install the Docker Compose plugin or standalone docker-compose)." >&2
  exit 1
fi

echo "Stack is starting. Endpoints:"
echo "  Grafana:    http://localhost:3001 (admin/admin)"
echo "  Prometheus: http://localhost:9090"
echo "  ClickHouse: http://localhost:8123"
echo "  Server TCP: localhost:9000"
echo "  Metrics:    http://localhost:9464/metrics"
