#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"

cd "$PROJECT_DIR"

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git is not installed." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: Docker is not installed. Run: sudo bash scripts/bootstrap-alibaba-linux.sh" >&2
  exit 1
fi

if docker info >/dev/null 2>&1; then
  DOCKER=(docker)
elif command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
  DOCKER=(sudo docker)
else
  echo "Error: cannot access the Docker daemon. Run with sudo or add this user to the docker group." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: the server working tree has local changes. Commit or remove them before deploying." >&2
  git status --short
  exit 1
fi

echo "[1/4] Pulling origin/$DEPLOY_BRANCH..."
git fetch --prune origin "$DEPLOY_BRANCH"
git checkout "$DEPLOY_BRANCH"
git pull --ff-only origin "$DEPLOY_BRANCH"

echo "[2/4] Building and starting containers..."
"${DOCKER[@]}" compose up -d --build --remove-orphans

echo "[3/4] Waiting for the HTTP health check..."
healthy=0
for _ in {1..30}; do
  if curl --fail --silent --show-error http://127.0.0.1/healthz >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 1
done

if [[ "$healthy" -ne 1 ]]; then
  echo "Error: the site did not become healthy in time." >&2
  "${DOCKER[@]}" compose ps
  "${DOCKER[@]}" compose logs --tail=100 web
  exit 1
fi

echo "[4/4] Deployment complete."
"${DOCKER[@]}" compose ps
echo "Site: http://wagaga.top"

