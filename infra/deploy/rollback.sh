#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/srv/littletask}"
RUN_USER="${LITTLETASK_RUN_USER:-littletask}"
NODE_HOME="${LITTLETASK_NODE_HOME:-/opt/littletask-node}"
ENV_FILE="${LITTLETASK_ENV_FILE:-${APP_ROOT}/shared/.env}"
requested_sha="${1:-}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "rollback.sh must run as root" >&2
  exit 1
fi

if [[ -n "${requested_sha}" ]]; then
  if [[ ! "${requested_sha}" =~ ^[a-f0-9]{40}$ ]]; then
    echo "Rollback SHA must contain exactly 40 lowercase hexadecimal characters" >&2
    exit 1
  fi
  target="${APP_ROOT}/releases/${requested_sha}"
else
  target="$(cat "${APP_ROOT}/shared/previous-release" 2>/dev/null || true)"
fi

if [[ -z "${target}" ]]; then
  echo "No previous release is recorded" >&2
  exit 1
fi
target="$(realpath -e "${target}")"
releases_root="$(realpath -e "${APP_ROOT}/releases")"
if [[ "${target}" != "${releases_root}/"* || ! -f "${target}/apps/api/dist/server.js" ]]; then
  echo "Rollback target is not a built LittleTask release" >&2
  exit 1
fi

current_target="$(readlink -f "${APP_ROOT}/current" 2>/dev/null || true)"
if [[ -z "${current_target}" || ! -d "${current_target}" ]]; then
  echo "Current release is missing" >&2
  exit 1
fi
printf '%s\n' "${current_target}" >"${APP_ROOT}/shared/previous-release"
chown "${RUN_USER}:${RUN_USER}" "${APP_ROOT}/shared/previous-release"
chmod 0600 "${APP_ROOT}/shared/previous-release"

temporary_link="${APP_ROOT}/.rollback-$$"
cleanup_temporary_link() {
  if [[ -L "${temporary_link}" ]]; then
    rm -f -- "${temporary_link}"
  fi
}
trap cleanup_temporary_link EXIT

switch_current() {
  local release="$1"
  cleanup_temporary_link
  ln -s "${release}" "${temporary_link}"
  mv -Tf "${temporary_link}" "${APP_ROOT}/current"
}

replace_processes() {
  pm2 delete littletask-api littletask-worker >/dev/null 2>&1 || true
  env \
    LITTLETASK_ENV_FILE="${ENV_FILE}" \
    LITTLETASK_LOG_DIR="${APP_ROOT}/shared/logs" \
    LITTLETASK_NODE="${NODE_HOME}/bin/node" \
    LITTLETASK_RUN_USER="${RUN_USER}" \
    pm2 start "${APP_ROOT}/current/infra/pm2/ecosystem.config.cjs" --update-env
}

wait_for_application() {
  for _attempt in $(seq 1 30); do
    if curl --fail --silent --show-error --max-time 3 \
      http://127.0.0.1:3100/api/health/ready >/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}

switch_current "${target}"
if ! replace_processes || ! wait_for_application; then
  switch_current "${current_target}"
  if replace_processes; then
    wait_for_application || true
  fi
  echo "Rollback target failed readiness; restored the original current release" >&2
  exit 1
fi
pm2 save
echo "Rolled back to $(basename "${target}")"
