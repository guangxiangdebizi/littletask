#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/srv/littletask}"
KEEP_RELEASES="${LITTLETASK_KEEP_RELEASES:-3}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "prune-releases.sh must run as root" >&2
  exit 1
fi
if [[ ! "${KEEP_RELEASES}" =~ ^[0-9]+$ ]] || (( KEEP_RELEASES < 3 )); then
  echo "LITTLETASK_KEEP_RELEASES must be an integer of at least 3" >&2
  exit 1
fi

releases_root="$(realpath -e "${APP_ROOT}/releases")"
current_target="$(readlink -f "${APP_ROOT}/current" 2>/dev/null || true)"
previous_target="$(cat "${APP_ROOT}/shared/previous-release" 2>/dev/null || true)"
mapfile -t candidates < <(
  find "${releases_root}" -mindepth 1 -maxdepth 1 -type d \
    -regextype posix-extended -regex '.*/[a-f0-9]{40}' -printf '%T@ %p\n' \
    | sort -nr \
    | cut -d' ' -f2-
)

for ((index = KEEP_RELEASES; index < ${#candidates[@]}; index += 1)); do
  candidate="$(realpath -e "${candidates[index]}")"
  if [[ "${candidate}" != "${releases_root}/"* ]]; then
    echo "Refusing to prune path outside release root: ${candidate}" >&2
    exit 1
  fi
  if [[ "${candidate}" == "${current_target}" || "${candidate}" == "${previous_target}" ]]; then
    continue
  fi
  rm -rf -- "${candidate}"
done
