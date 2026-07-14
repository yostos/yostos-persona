#!/usr/bin/env bash
# blog-yostos の content/ を yostos-persona の content/ に同期する。
# rclone sync は片方向のミラーリング（コピー先の余分なファイルは削除される）。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

SRC="${BLOG_CONTENT_DIR:-${HOME}/ghq/github.com/yostos/blog-yostos/content}"
DEST="${REPO_ROOT}/content"

if [ ! -d "${SRC}" ]; then
  echo "コピー元が見つかりません: ${SRC}" >&2
  exit 1
fi

RCLONE_OPTS=(
  --exclude ".DS_Store"
  --exclude ".git/**"
  --exclude "*.webp"
  --exclude "*.png"
  --exclude "*.jpg"
  --exclude "*.jpeg"
  --exclude "*.svg"
)

if [ "${1:-}" = "--dry-run" ]; then
  echo "[dry-run] ${SRC} -> ${DEST}"
  rclone sync "${SRC}" "${DEST}" "${RCLONE_OPTS[@]}" --dry-run -v
else
  rclone sync "${SRC}" "${DEST}" "${RCLONE_OPTS[@]}" -v
fi
