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
DOCKER_REGISTRY_MIRROR="${DOCKER_REGISTRY_MIRROR:-https://ykakt2xs.mirror.aliyuncs.com}"

echo "[1/6] Installing basic tools..."
dnf -y install git curl wget

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  if [[ "$ALINUX_MAJOR" == "3" ]]; then
    echo "[2/6] Configuring the Alibaba Cloud Docker CE package repository..."
    wget -O /etc/yum.repos.d/docker-ce.repo \
      http://mirrors.cloud.aliyuncs.com/docker-ce/linux/centos/docker-ce.repo
    sed -i 's|https://mirrors.aliyun.com|http://mirrors.cloud.aliyuncs.com|g' \
      /etc/yum.repos.d/docker-ce.repo

    echo "[3/6] Installing Docker Engine and Docker Compose..."
    dnf -y install dnf-plugin-releasever-adapter --repo alinux3-plus
    dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  else
    echo "[2/6] Using the Alibaba Cloud Linux 4 package repository..."
    echo "[3/6] Installing Moby and Docker Compose..."
    dnf -y install moby docker-compose-plugin
  fi
else
  echo "[2/6] Docker and Docker Compose are already installed."
  echo "[3/6] Skipping Docker package installation."
fi

echo "[4/6] Configuring the Docker registry mirror..."
mkdir -p /etc/docker
if [[ -s /etc/docker/daemon.json ]]; then
  if ! grep -Fq "$DOCKER_REGISTRY_MIRROR" /etc/docker/daemon.json; then
    echo "Error: /etc/docker/daemon.json already exists and was not overwritten." >&2
    echo "Add this registry mirror manually: $DOCKER_REGISTRY_MIRROR" >&2
    exit 1
  fi
else
  cat > /etc/docker/daemon.json <<EOF
{
  "registry-mirrors": ["$DOCKER_REGISTRY_MIRROR"]
}
EOF
fi

echo "[5/6] Starting Docker and enabling it at boot..."
systemctl enable docker
systemctl restart docker
docker version
docker compose version

echo "[6/6] Starting the website..."
cd "$PROJECT_DIR"
bash deploy.sh
