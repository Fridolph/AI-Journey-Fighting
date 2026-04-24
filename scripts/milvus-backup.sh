#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
VOLUME_DIR="${VOLUME_DIR:-${ROOT_DIR}/volumes}"
BACKUP_ROOT="${BACKUP_ROOT:-${ROOT_DIR}/backups/milvus}"
COMPOSE_FILE="${COMPOSE_FILE:-${ROOT_DIR}/milvus-standalone-docker-compose.yml}"
SAFE_MODE="false"

print_help() {
  cat <<'EOF'
Usage:
  ./scripts/milvus-backup.sh [--safe]

Options:
  --safe    Stop Milvus containers before backup and start them again after backup.
  -h, --help
EOF
}

for arg in "$@"; do
  case "$arg" in
    --safe)
      SAFE_MODE="true"
      ;;
    -h|--help)
      print_help
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      print_help
      exit 1
      ;;
  esac
done

if [[ ! -d "${VOLUME_DIR}" ]]; then
  echo "Milvus volume directory not found: ${VOLUME_DIR}" >&2
  exit 1
fi

mkdir -p "${BACKUP_ROOT}"

TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
ARCHIVE_PATH="${BACKUP_ROOT}/milvus-volumes-${TIMESTAMP}.tar.gz"
VOLUME_PARENT="$(dirname "${VOLUME_DIR}")"
VOLUME_NAME="$(basename "${VOLUME_DIR}")"

restart_services() {
  docker compose -f "${COMPOSE_FILE}" up -d >/dev/null
}

if [[ "${SAFE_MODE}" == "true" ]]; then
  echo "Stopping Milvus containers for a safer backup..."
  docker compose -f "${COMPOSE_FILE}" down >/dev/null
  trap restart_services EXIT
fi

echo "Creating backup archive..."
tar -czf "${ARCHIVE_PATH}" -C "${VOLUME_PARENT}" "${VOLUME_NAME}"

ARCHIVE_SIZE="$(du -sh "${ARCHIVE_PATH}" | awk '{print $1}')"
echo "Backup created: ${ARCHIVE_PATH}"
echo "Archive size: ${ARCHIVE_SIZE}"

if [[ "${SAFE_MODE}" == "true" ]]; then
  restart_services
  trap - EXIT
  echo "Milvus containers restarted."
fi
