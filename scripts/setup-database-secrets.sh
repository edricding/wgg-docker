#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Error: run this script as root: sudo bash scripts/setup-database-secrets.sh" >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "Error: openssl is required. Install it with: sudo dnf -y install openssl" >&2
  exit 1
fi

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SECRET_DIR="${PROJECT_DIR}/secrets"
APP_PASSWORD_FILE="${SECRET_DIR}/mysql_app_password.txt"
ROOT_PASSWORD_FILE="${SECRET_DIR}/mysql_root_password.txt"
ADMIN_PASSWORD_FILE="${SECRET_DIR}/admin_password.txt"
ADMIN_HTPASSWD_FILE="${SECRET_DIR}/admin.htpasswd"

umask 077
mkdir -p "$SECRET_DIR"
chmod 700 "$SECRET_DIR"

create_secret() {
  local target_file="$1"
  local label="$2"

  if [[ -s "$target_file" ]]; then
    echo "Keeping existing ${label}."
    chmod 600 "$target_file"
    return
  fi

  if [[ -e "$target_file" ]]; then
    echo "Error: ${target_file} exists but is empty. Remove it and run this script again." >&2
    exit 1
  fi

  openssl rand -base64 36 > "$target_file"
  chmod 600 "$target_file"
  echo "Generated ${label}."
}

create_secret "$ROOT_PASSWORD_FILE" "MySQL root password"
create_secret "$APP_PASSWORD_FILE" "MySQL application password"
create_secret "$ADMIN_PASSWORD_FILE" "admin login password"

if [[ -s "$ADMIN_HTPASSWD_FILE" ]]; then
  echo "Keeping existing admin authentication file."
  chmod 600 "$ADMIN_HTPASSWD_FILE"
else
  admin_hash="$(openssl passwd -apr1 -in "$ADMIN_PASSWORD_FILE")"
  printf 'admin:%s\n' "$admin_hash" > "$ADMIN_HTPASSWD_FILE"
  chmod 600 "$ADMIN_HTPASSWD_FILE"
  echo "Generated admin HTTP authentication file."
fi

echo
echo "Database credentials are ready."
echo "Database: wgg_wedding"
echo "Application user: wgg_app"
echo "Application password file: ${APP_PASSWORD_FILE}"
echo "Root password file: ${ROOT_PASSWORD_FILE}"
echo "Admin username: admin"
echo "Admin password file: ${ADMIN_PASSWORD_FILE}"
echo
echo "To view the application password for Navicat, run:"
echo "  sudo cat ${APP_PASSWORD_FILE}"
echo
echo "To view the db.wagaga.top admin password, run:"
echo "  sudo cat ${ADMIN_PASSWORD_FILE}"
