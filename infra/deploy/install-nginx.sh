#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/srv/littletask}"
source_root="${APP_ROOT}/current/infra/nginx"
timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
backup_root="/etc/nginx/littletask-backups/${timestamp}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "install-nginx.sh must run as root" >&2
  exit 1
fi
for source_file in \
  "${source_root}/littletask-rate-limits.conf" \
  "${source_root}/littletask-proxy.conf" \
  "${source_root}/littletask-security-headers.conf" \
  "${source_root}/manbaout.com.conf"; do
  if [[ ! -f "${source_file}" ]]; then
    echo "Missing Nginx source file: ${source_file}" >&2
    exit 1
  fi
done

install -d -m 0700 "${backup_root}"
targets=(
  /etc/nginx/conf.d/littletask-rate-limits.conf
  /etc/nginx/snippets/littletask-proxy.conf
  /etc/nginx/snippets/littletask-security-headers.conf
  /etc/nginx/sites-available/manbaout-mail.conf
)
for target in "${targets[@]}"; do
  if [[ -f "${target}" ]]; then
    cp -a "${target}" "${backup_root}/$(basename "${target}")"
  else
    touch "${backup_root}/$(basename "${target}").absent"
  fi
done

restore_nginx() {
  for target in "${targets[@]}"; do
    backup="${backup_root}/$(basename "${target}")"
    if [[ -f "${backup}" ]]; then
      cp -a "${backup}" "${target}"
    elif [[ -f "${backup}.absent" ]]; then
      rm -f -- "${target}"
    fi
  done
}

install -m 0644 "${source_root}/littletask-rate-limits.conf" \
  /etc/nginx/conf.d/littletask-rate-limits.conf
install -m 0644 "${source_root}/littletask-proxy.conf" \
  /etc/nginx/snippets/littletask-proxy.conf
install -m 0644 "${source_root}/littletask-security-headers.conf" \
  /etc/nginx/snippets/littletask-security-headers.conf
install -m 0644 "${source_root}/manbaout.com.conf" \
  /etc/nginx/sites-available/manbaout-mail.conf

if ! nginx -t; then
  restore_nginx
  nginx -t >/dev/null
  echo "Nginx validation failed; prior files were restored from ${backup_root}" >&2
  exit 1
fi

if ! systemctl reload nginx; then
  restore_nginx
  nginx -t >/dev/null
  systemctl reload nginx
  echo "Nginx reload failed; prior files were restored from ${backup_root}" >&2
  exit 1
fi
echo "Nginx reloaded; prior files are in ${backup_root}"
