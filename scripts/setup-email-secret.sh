#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Error: run this script as root: sudo bash scripts/setup-email-secret.sh" >&2
  exit 1
fi

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SECRET_DIR="${PROJECT_DIR}/secrets"
PASSWORD_FILE="${SECRET_DIR}/gmail_app_password.txt"

umask 077
mkdir -p "$SECRET_DIR"
chmod 700 "$SECRET_DIR"

if [[ -s "$PASSWORD_FILE" ]]; then
  echo "Gmail app password already exists. Keeping the current value."
  echo "To replace it, delete only this file and run the script again:"
  echo "  ${PASSWORD_FILE}"
  exit 0
fi

echo "Enter the 16-character Google app password for d.singine@gmail.com."
echo "Your normal Google account password will not work and must not be entered here."
read -r -s -p "Gmail app password: " gmail_app_password
echo

gmail_app_password="${gmail_app_password//[[:space:]]/}"
if [[ "${#gmail_app_password}" -ne 16 ]]; then
  echo "Error: a Google app password must contain 16 characters (spaces are ignored)." >&2
  exit 1
fi

printf '%s' "$gmail_app_password" > "$PASSWORD_FILE"
chmod 600 "$PASSWORD_FILE"

echo "Gmail app password saved securely: ${PASSWORD_FILE}"
