#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/srv/littletask}"
RUN_USER="${LITTLETASK_RUN_USER:-littletask}"
NODE_VERSION="${NODE_VERSION:-22.20.0}"
NODE_LINK="${LITTLETASK_NODE_HOME:-/opt/littletask-node}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "bootstrap-ubuntu.sh must run as root" >&2
  exit 1
fi

case "$(uname -m)" in
  x86_64) node_arch="x64" ;;
  aarch64) node_arch="arm64" ;;
  *)
    echo "Unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

for command_name in curl docker git nginx pm2 runuser sha256sum tar; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Missing required command: ${command_name}" >&2
    exit 1
  fi
done

if ! id "${RUN_USER}" >/dev/null 2>&1; then
  useradd --system --home-dir "${APP_ROOT}" --create-home --shell /usr/sbin/nologin "${RUN_USER}"
fi

install -d -o "${RUN_USER}" -g "${RUN_USER}" -m 0755 "${APP_ROOT}" "${APP_ROOT}/releases"
install -d -o "${RUN_USER}" -g "${RUN_USER}" -m 0750 \
  "${APP_ROOT}/shared" \
  "${APP_ROOT}/shared/backups" \
  "${APP_ROOT}/shared/logs"

node_directory="/opt/node-v${NODE_VERSION}-linux-${node_arch}"
if [[ ! -x "${node_directory}/bin/node" ]]; then
  temporary_directory="$(mktemp -d)"
  trap 'rm -rf -- "${temporary_directory}"' EXIT
  archive="node-v${NODE_VERSION}-linux-${node_arch}.tar.xz"
  base_url="https://nodejs.org/dist/v${NODE_VERSION}"
  curl --fail --location --silent --show-error "${base_url}/${archive}" \
    --output "${temporary_directory}/${archive}"
  curl --fail --location --silent --show-error "${base_url}/SHASUMS256.txt" \
    --output "${temporary_directory}/SHASUMS256.txt"
  (
    cd "${temporary_directory}"
    grep " ${archive}$" SHASUMS256.txt | sha256sum --check --strict
  )
  tar -xJf "${temporary_directory}/${archive}" -C /opt
fi

ln -sfn "${node_directory}" "${NODE_LINK}"
"${node_directory}/bin/corepack" enable --install-directory "${node_directory}/bin"
"${node_directory}/bin/corepack" prepare pnpm@9.15.9 --activate

node_major="$("${NODE_LINK}/bin/node" --version | sed -E 's/^v([0-9]+).*/\1/')"
if [[ "${node_major}" -lt 22 ]]; then
  echo "Isolated Node runtime must be version 22 or newer" >&2
  exit 1
fi

echo "LittleTask runtime prepared at ${APP_ROOT} with $("${NODE_LINK}/bin/node" --version)"
