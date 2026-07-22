#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/srv/littletask}"
MAIL_ROOT="${MANBAOUT_MAIL_ROOT:-/opt/manbaout-mail}"
source_file="${APP_ROOT}/current/infra/docker/manbaout-mail.compose.override.yml"
compose_file="${MAIL_ROOT}/compose.yaml"
override_file="${MAIL_ROOT}/compose.override.yaml"

if [[ "${EUID}" -ne 0 ]]; then
  echo "prepare-webmail-path.sh must run as root" >&2
  exit 1
fi
if [[ ! -f "${compose_file}" || ! -f "${source_file}" ]]; then
  echo "Missing Roundcube compose file or LittleTask override" >&2
  exit 1
fi
if [[ -e "${override_file}" ]]; then
  if cmp --silent "${source_file}" "${override_file}" \
    && curl --fail --silent --show-error --max-time 3 http://127.0.0.1:8082/ \
      | grep -F 'action="/webmail/' >/dev/null; then
    echo "Webmail is already configured at /webmail/"
    exit 0
  fi
  echo "A non-LittleTask compose.override.yaml already exists; merge it manually" >&2
  exit 1
fi
install -m 0644 "${source_file}" "${override_file}"

restore_override() {
  rm -f -- "${override_file}"
  docker compose -f "${compose_file}" up -d --no-deps webmail >/dev/null 2>&1 || true
}

if ! docker compose -f "${compose_file}" -f "${override_file}" up -d --no-deps webmail; then
  restore_override
  echo "Roundcube recreation failed; the previous override was restored" >&2
  exit 1
fi

webmail_ready=false
for _attempt in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 3 http://127.0.0.1:8082/ \
    | grep -F 'action="/webmail/' >/dev/null; then
    webmail_ready=true
    break
  fi
  sleep 2
done
if [[ "${webmail_ready}" != true ]]; then
  restore_override
  echo "Roundcube did not emit the /webmail/ request path; the previous override was restored" >&2
  exit 1
fi

echo "Webmail request path prepared at /webmail/"
