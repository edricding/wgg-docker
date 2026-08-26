#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Error: run this script as root: sudo bash scripts/renew-https.sh" >&2
  exit 1
fi

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
CERTBOT_IMAGE="m.daocloud.io/docker.io/certbot/certbot:latest"

docker run --rm \
  -v "${PROJECT_DIR}/certbot/conf:/etc/letsencrypt" \
  -v "${PROJECT_DIR}/certbot/www:/var/www/certbot" \
  "$CERTBOT_IMAGE" renew --webroot -w /var/www/certbot --quiet

docker compose --project-directory "$PROJECT_DIR" exec -T web nginx -s reload
echo "Certificate renewal check complete."
