#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/srv/littletask}"
RUN_USER="${LITTLETASK_RUN_USER:-littletask}"
NODE_HOME="${LITTLETASK_NODE_HOME:-/opt/littletask-node}"
REPOSITORY="${LITTLETASK_REPOSITORY:-https://github.com/guangxiangdebizi/littletask.git}"
PUBLIC_API_URL="${LITTLETASK_PUBLIC_API_URL:-https://manbaout.com/api/v1}"
ENV_FILE="${LITTLETASK_ENV_FILE:-${APP_ROOT}/shared/.env}"
RELEASE_SHA="${1:-}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "release.sh must run as root" >&2
  exit 1
fi
if [[ ! "${RELEASE_SHA}" =~ ^[a-f0-9]{40}$ ]]; then
  echo "Usage: release.sh <full-40-character-git-sha>" >&2
  exit 1
fi
if [[ ! -x "${NODE_HOME}/bin/node" ]]; then
  echo "Missing isolated Node runtime at ${NODE_HOME}" >&2
  exit 1
fi
if [[ ! -f "${ENV_FILE}" || -L "${ENV_FILE}" ]]; then
  echo "Missing production environment file: ${ENV_FILE}" >&2
  exit 1
fi
if [[ "$(stat -c '%U' "${ENV_FILE}")" != "${RUN_USER}" ]]; then
  echo "Production environment file must be owned by ${RUN_USER}" >&2
  exit 1
fi
permissions="$(stat -c '%a' "${ENV_FILE}")"
if (( 8#${permissions} & 077 )); then
  echo "Production environment file must not be readable by group or others" >&2
  exit 1
fi
for variable_name in DATABASE_URL OPENAI_API_KEY POSTGRES_PASSWORD; do
  if ! grep -Eq "^${variable_name}=.+" "${ENV_FILE}"; then
    echo "Missing ${variable_name} in production environment file" >&2
    exit 1
  fi
  if grep -Eq "^${variable_name}=.*CHANGE_ME" "${ENV_FILE}"; then
    echo "Replace the ${variable_name} placeholder before release" >&2
    exit 1
  fi
done

release_directory="${APP_ROOT}/releases/${RELEASE_SHA}"
current_link="${APP_ROOT}/current"
temporary_link="${APP_ROOT}/.current-$$"
previous_release=""
if [[ -L "${current_link}" ]]; then
  previous_release="$(readlink -f "${current_link}")"
  releases_root="$(realpath -e "${APP_ROOT}/releases")"
  if [[ "${previous_release}" != "${releases_root}/"* ]]; then
    echo "Current release points outside ${releases_root}" >&2
    exit 1
  fi
elif [[ -e "${current_link}" ]]; then
  echo "${current_link} exists and is not a symbolic link" >&2
  exit 1
fi

run_as_app() {
  runuser -u "${RUN_USER}" -- env \
    HOME="${APP_ROOT}" \
    PATH="${NODE_HOME}/bin:/usr/bin:/bin" \
    "$@"
}

cleanup_temporary_link() {
  if [[ -L "${temporary_link}" ]]; then
    rm -f -- "${temporary_link}"
  fi
}
trap cleanup_temporary_link EXIT

switch_current() {
  local target="$1"
  cleanup_temporary_link
  ln -s "${target}" "${temporary_link}"
  mv -Tf "${temporary_link}" "${current_link}"
}

if [[ ! -d "${release_directory}/.git" ]]; then
  install -d -o "${RUN_USER}" -g "${RUN_USER}" -m 0755 "${release_directory}"
  run_as_app git -C "${release_directory}" init --quiet
  run_as_app git -C "${release_directory}" fetch --depth 1 "${REPOSITORY}" "${RELEASE_SHA}"
  run_as_app git -C "${release_directory}" checkout --detach --quiet FETCH_HEAD
fi

checked_out_sha="$(run_as_app git -C "${release_directory}" rev-parse HEAD)"
if [[ "${checked_out_sha}" != "${RELEASE_SHA}" ]]; then
  echo "Release directory does not contain the requested Git SHA" >&2
  exit 1
fi

run_as_app "${NODE_HOME}/bin/corepack" pnpm install --frozen-lockfile --prod=false
run_as_app env EXPO_PUBLIC_API_URL="${PUBLIC_API_URL}" \
  "${NODE_HOME}/bin/corepack" pnpm build

docker compose --env-file "${ENV_FILE}" \
  -f "${release_directory}/infra/docker/compose.production.yml" up -d postgres

database_ready=false
for _attempt in $(seq 1 30); do
  if [[ "$(docker inspect --format '{{.State.Health.Status}}' littletask-postgres 2>/dev/null || true)" == "healthy" ]]; then
    database_ready=true
    break
  fi
  sleep 2
done
if [[ "${database_ready}" != true ]]; then
  echo "PostgreSQL did not become healthy" >&2
  exit 1
fi

run_as_app env LITTLETASK_ENV_FILE="${ENV_FILE}" \
  "${NODE_HOME}/bin/corepack" pnpm db:migrate:deploy

if [[ -n "${previous_release}" ]]; then
  printf '%s\n' "${previous_release}" >"${APP_ROOT}/shared/previous-release"
  chown "${RUN_USER}:${RUN_USER}" "${APP_ROOT}/shared/previous-release"
  chmod 0600 "${APP_ROOT}/shared/previous-release"
fi

switch_current "${release_directory}"

reload_processes() {
  env \
    LITTLETASK_ENV_FILE="${ENV_FILE}" \
    LITTLETASK_LOG_DIR="${APP_ROOT}/shared/logs" \
    LITTLETASK_NODE="${NODE_HOME}/bin/node" \
    LITTLETASK_RUN_USER="${RUN_USER}" \
    pm2 startOrReload "${current_link}/infra/pm2/ecosystem.config.cjs" --update-env
}

rollback_after_failure() {
  if [[ -n "${previous_release}" && -d "${previous_release}" ]]; then
    switch_current "${previous_release}"
    reload_processes || true
  else
    pm2 delete littletask-api littletask-worker >/dev/null 2>&1 || true
    if [[ -L "${current_link}" && "$(readlink -f "${current_link}")" == "${release_directory}" ]]; then
      rm -f -- "${current_link}"
    fi
  fi
}

if ! reload_processes; then
  rollback_after_failure
  echo "PM2 reload failed; current release was restored when possible" >&2
  exit 1
fi

application_ready=false
for _attempt in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 3 \
    http://127.0.0.1:3100/api/health/ready >/dev/null; then
    application_ready=true
    break
  fi
  sleep 2
done
if [[ "${application_ready}" != true ]]; then
  rollback_after_failure
  echo "Application readiness failed; current release was restored when possible" >&2
  exit 1
fi

pm2 save
"${release_directory}/infra/deploy/prune-releases.sh"
echo "Released ${RELEASE_SHA}"
