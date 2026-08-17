#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Error: run this script as root: sudo bash scripts/bootstrap-alibaba-linux.sh" >&2
  exit 1
fi

if [[ ! -r /etc/os-release ]]; then
  echo "Error: cannot identify the operating system." >&2
  exit 1
fi

source /etc/os-release
ALINUX_MAJOR="${VERSION_ID%%.*}"
if [[ "${ID:-}" != "alinux" || ( "$ALINUX_MAJOR" != "3" && "$ALINUX_MAJOR" != "4" ) ]]; then
  echo "Error: this bootstrap script supports Alibaba Cloud Linux 3 and 4 only." >&2
  echo "Detected: ${PRETTY_NAME:-unknown}" >&2
  exit 1
fi

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[1/5] Installing basic tools..."
dnf -y install git curl wget

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  if [[ "$ALINUX_MAJOR" == "3" ]]; then
    echo "[2/5] Configuring the Alibaba Cloud Docker CE mirror..."
    wget -O /etc/yum.repos.d/docker-ce.repo \
      http://mirrors.cloud.aliyuncs.com/docker-ce/linux/centos/docker-ce.repo
    sed -i 's|https://mirrors.aliyun.com|http://mirrors.cloud.aliyuncs.com|g' \
      /etc/yum.repos.d/docker-ce.repo

    echo "[3/5] Installing Docker Engine and Docker Compose..."
    dnf -y install dnf-plugin-releasever-adapter --repo alinux3-plus
    dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  else
    echo "[2/5] Using the Alibaba Cloud Linux 4 package repository..."
    echo "[3/5] Installing Moby and Docker Compose..."
    dnf -y install moby docker-compose-plugin
  fi
else
  echo "[2/5] Docker and Docker Compose are already installed."
  echo "[3/5] Skipping Docker package installation."
fi

echo "[4/5] Starting Docker and enabling it at boot..."
systemctl enable --now docker
docker version
docker compose version

echo "[5/5] Starting the website..."
cd "$PROJECT_DIR"
bash deploy.sh
