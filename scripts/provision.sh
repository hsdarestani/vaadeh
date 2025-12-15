#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl gnupg lsb-release
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  echo \"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable\" \
    | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

if [ ! -f .env ]; then
  echo "Creating .env from template..."
  cp .env.example .env
  echo "Fill .env with production secrets before continuing."
fi

echo "Launching core services (Postgres/Redis)"
docker compose -f deploy/docker-compose.prod.yml up -d postgres redis

echo "Applying Prisma migrations"
docker compose -f deploy/docker-compose.prod.yml run --rm api npx prisma migrate deploy

echo "Seeding baseline data"
docker compose -f deploy/docker-compose.prod.yml run --rm api npx prisma db seed

echo "Starting application stack"
docker compose -f deploy/docker-compose.prod.yml up -d

echo "Deployment complete. Inspect running services with 'docker compose -f deploy/docker-compose.prod.yml ps'."
