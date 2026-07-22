#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

APP_ROOT="${APP_ROOT:-/srv/littletask}"
RUN_USER="${LITTLETASK_RUN_USER:-littletask}"
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMPLATE="${LITTLETASK_ENV_TEMPLATE:-${repository_root}/infra/deploy/production.env.example}"
ENV_FILE="${LITTLETASK_ENV_FILE:-${APP_ROOT}/shared/.env}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "configure-production-env.sh must run as root" >&2
  exit 1
fi
if [[ -e "${ENV_FILE}" || -L "${ENV_FILE}" ]]; then
  echo "Refusing to replace existing production environment file: ${ENV_FILE}" >&2
  exit 1
fi
if [[ ! -f "${TEMPLATE}" ]]; then
  echo "Missing production environment template: ${TEMPLATE}" >&2
  exit 1
fi
if [[ ! "${OPENAI_API_KEY:-}" =~ ^[A-Za-z0-9_-]{20,}$ ]]; then
  echo "A rotated OPENAI_API_KEY must be present in the process environment" >&2
  exit 1
fi
if ! command -v openssl >/dev/null 2>&1; then
  echo "Missing required command: openssl" >&2
  exit 1
fi

database_password="$(openssl rand -hex 32)"
temporary_file="$(mktemp "${APP_ROOT}/shared/.env.XXXXXX")"
trap 'rm -f -- "${temporary_file}"' EXIT

sed \
  -e "s|CHANGE_ME_URL_SAFE_RANDOM_PASSWORD|${database_password}|g" \
  -e "s|CHANGE_ME_ROTATED_RUNTIME_KEY|${OPENAI_API_KEY}|g" \
  "${TEMPLATE}" >"${temporary_file}"

if grep -q 'CHANGE_ME' "${temporary_file}"; then
  echo "Production environment still contains a placeholder" >&2
  exit 1
fi

install -o "${RUN_USER}" -g "${RUN_USER}" -m 0600 "${temporary_file}" "${ENV_FILE}"
echo "Created ${ENV_FILE} without printing secret values"
