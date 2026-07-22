#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

APP_ROOT="${APP_ROOT:-/srv/littletask}"
CONTAINER="${LITTLETASK_POSTGRES_CONTAINER:-littletask-postgres}"
RETENTION_DAYS="${LITTLETASK_BACKUP_RETENTION_DAYS:-14}"
BACKUP_DIRECTORY="${APP_ROOT}/shared/backups"

if [[ "${EUID}" -ne 0 ]]; then
  echo "backup-postgres.sh must run as root" >&2
  exit 1
fi
if [[ ! "${RETENTION_DAYS}" =~ ^[1-9][0-9]*$ ]]; then
  echo "Backup retention must be a positive integer" >&2
  exit 1
fi

install -d -m 0750 "${BACKUP_DIRECTORY}"
backup_root="$(realpath -e "${BACKUP_DIRECTORY}")"
expected_root="$(realpath -e "${APP_ROOT}/shared")/backups"
if [[ "${backup_root}" != "${expected_root}" ]]; then
  echo "Backup directory resolved outside the expected shared path" >&2
  exit 1
fi

timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
temporary_file="${backup_root}/.${timestamp}.dump.partial"
final_file="${backup_root}/littletask-${timestamp}.dump"
trap 'rm -f -- "${temporary_file}"' EXIT

docker exec "${CONTAINER}" sh -c \
  'exec pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom' \
  >"${temporary_file}"
if [[ ! -s "${temporary_file}" ]]; then
  echo "PostgreSQL backup is empty" >&2
  exit 1
fi
mv "${temporary_file}" "${final_file}"
find "${backup_root}" -maxdepth 1 -type f -name 'littletask-*.dump' \
  -mtime "+${RETENTION_DAYS}" -delete
echo "Created ${final_file}"
