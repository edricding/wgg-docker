#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Error: run this script as root: sudo CERTBOT_EMAIL=you@example.com bash scripts/setup-https.sh" >&2
  exit 1
fi

if [[ -z "${CERTBOT_EMAIL:-}" ]]; then
  echo "Error: set CERTBOT_EMAIL to your email address." >&2
  echo "Example: sudo CERTBOT_EMAIL=you@example.com bash scripts/setup-https.sh" >&2
  exit 1
fi

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="${PROJECT_DIR}/certbot/conf/live/wagaga.top"
CERTBOT_IMAGE="m.daocloud.io/docker.io/certbot/certbot:latest"

if docker info >/dev/null 2>&1; then
  DOCKER=(docker)
elif command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
  DOCKER=(sudo docker)
else
  echo "Error: cannot access the Docker daemon." >&2
  exit 1
fi

mkdir -p "${PROJECT_DIR}/certbot/conf" "${PROJECT_DIR}/certbot/www"

if [[ -s "${CERT_DIR}/fullchain.pem" && -s "${CERT_DIR}/privkey.pem" ]]; then
  echo "HTTPS certificate already exists: ${CERT_DIR}"
  exit 0
fi

echo "Stopping the web container temporarily so Let's Encrypt can verify port 80..."
"${DOCKER[@]}" compose --project-directory "$PROJECT_DIR" stop web >/dev/null 2>&1 || true

"${DOCKER[@]}" run --rm \
  --name wgg-certbot-bootstrap \
  -p 80:80 \
  -v "${PROJECT_DIR}/certbot/conf:/etc/letsencrypt" \
  "$CERTBOT_IMAGE" certonly --standalone \
  --non-interactive --agree-tos --no-eff-email \
  --email "$CERTBOT_EMAIL" \
  --cert-name wagaga.top \
  -d wagaga.top -d wedding.wagaga.top -d db.wagaga.top

echo "HTTPS certificate created. Run: sudo bash ${PROJECT_DIR}/deploy.sh"
