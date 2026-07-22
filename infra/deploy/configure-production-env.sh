#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

APP_ROOT="${APP_ROOT:-/srv/littletask}"
RUN_USER="${LITTLETASK_RUN_USER:-littletask}"
NODE_HOME="${LITTLETASK_NODE_HOME:-/opt/littletask-node}"
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
api_key="${OPENAI_API_KEY:-}"
if (( ${#api_key} < 20 || ${#api_key} > 512 )) \
  || [[ "${api_key}" == *$'\n'* || "${api_key}" == *$'\r'* ]]; then
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

TEMPLATE="${TEMPLATE}" \
  TEMPORARY_FILE="${temporary_file}" \
  DATABASE_PASSWORD="${database_password}" \
  OPENAI_API_KEY="${api_key}" \
  "${NODE_HOME}/bin/node" <<'NODE'
const fs = require('node:fs');

const templatePath = process.env.TEMPLATE;
const temporaryFile = process.env.TEMPORARY_FILE;
const databasePassword = process.env.DATABASE_PASSWORD;
const apiKey = process.env.OPENAI_API_KEY;
if (!templatePath || !temporaryFile || !databasePassword || !apiKey) {
  throw new Error('Environment template inputs are incomplete');
}
const template = fs.readFileSync(templatePath, 'utf8');
const output = template
  .replaceAll('CHANGE_ME_URL_SAFE_RANDOM_PASSWORD', databasePassword)
  .replace('CHANGE_ME_ROTATED_RUNTIME_KEY', apiKey);
fs.writeFileSync(temporaryFile, output, { encoding: 'utf8', mode: 0o600 });
NODE

if grep -q 'CHANGE_ME' "${temporary_file}"; then
  echo "Production environment still contains a placeholder" >&2
  exit 1
fi

install -o "${RUN_USER}" -g "${RUN_USER}" -m 0600 "${temporary_file}" "${ENV_FILE}"
echo "Created ${ENV_FILE} without printing secret values"
