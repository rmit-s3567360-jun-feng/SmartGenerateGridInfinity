#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

pause_before_exit() {
  printf '\nPress Enter to close...'
  read -r _
}

cd "$ROOT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] npm is not installed or not in PATH."
  echo "[ERROR] Install Node.js first: https://nodejs.org/"
  pause_before_exit
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[INFO] node_modules not found, installing dependencies..."
  if ! npm install; then
    echo "[ERROR] npm install failed."
    pause_before_exit
    exit 1
  fi
fi

echo "[INFO] Starting development server..."
echo "[INFO] Browser will open automatically after the Vite server starts."

if ! npm run dev -- --host 0.0.0.0 --open; then
  echo "[ERROR] Development server exited with an error."
  pause_before_exit
  exit 1
fi
