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

required_secret_files=(
  "$PROJECT_DIR/secrets/mysql_root_password.txt"
  "$PROJECT_DIR/secrets/mysql_app_password.txt"
  "$PROJECT_DIR/secrets/admin_password.txt"
  "$PROJECT_DIR/secrets/admin.htpasswd"
  "$PROJECT_DIR/secrets/gmail_app_password.txt"
)

for secret_file in "${required_secret_files[@]}"; do
  if [[ ! -s "$secret_file" ]]; then
    echo "Error: missing required secret: $secret_file" >&2
    echo "Run the matching setup script under: $PROJECT_DIR/scripts/" >&2
    exit 1
  fi
done

# Docker Compose mounts local secret files with their host permissions. The API
# runs as the unprivileged `node` user, so its mounted secrets must be readable.
# The parent secrets directory remains mode 700 and is accessible only to root
# on the host.
chmod 700 "$PROJECT_DIR/secrets"
chmod 600 "$PROJECT_DIR/secrets/mysql_root_password.txt"
chmod 644 \
  "$PROJECT_DIR/secrets/mysql_app_password.txt" \
  "$PROJECT_DIR/secrets/admin_password.txt" \
  "$PROJECT_DIR/secrets/admin.htpasswd" \
  "$PROJECT_DIR/secrets/gmail_app_password.txt"

if [[ ! -s "$PROJECT_DIR/certbot/conf/live/wagaga.top/fullchain.pem" \
  || ! -s "$PROJECT_DIR/certbot/conf/live/wagaga.top/privkey.pem" ]]; then
  echo "Error: HTTPS certificate is missing." >&2
  echo "Run: sudo CERTBOT_EMAIL=you@example.com bash $PROJECT_DIR/scripts/setup-https.sh" >&2
  exit 1
fi

echo "[2/4] Building and starting containers..."
"${DOCKER[@]}" compose up -d --build --remove-orphans

echo "[3/4] Waiting for MySQL, API and HTTPS health checks..."
healthy=0
for _ in {1..90}; do
  if "${DOCKER[@]}" compose exec -T database sh -c \
      'mysqladmin ping -h 127.0.0.1 -uroot --password="$(cat /run/secrets/mysql_root_password)" --silent' \
      >/dev/null 2>&1 \
    && "${DOCKER[@]}" compose exec -T api node -e \
      "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      >/dev/null 2>&1 \
    && curl --fail --silent --show-error http://127.0.0.1/healthz >/dev/null 2>&1 \
    && curl --fail --silent --show-error \
      --resolve wedding.wagaga.top:443:127.0.0.1 https://wedding.wagaga.top/ >/dev/null 2>&1 \
    && [[ "$(curl --silent --output /dev/null --write-out '%{http_code}' \
      --resolve db.wagaga.top:443:127.0.0.1 https://db.wagaga.top/)" == "401" ]]; then
    healthy=1
    break
  fi
  sleep 1
done

if [[ "$healthy" -ne 1 ]]; then
  echo "Error: the site did not become healthy in time." >&2
  "${DOCKER[@]}" compose ps
  "${DOCKER[@]}" compose logs --tail=100 web api database
  exit 1
fi

echo "[4/4] Deployment complete."
"${DOCKER[@]}" compose ps
echo "Site: https://wagaga.top"
echo "Wedding: https://wedding.wagaga.top"
echo "Admin: https://db.wagaga.top"
