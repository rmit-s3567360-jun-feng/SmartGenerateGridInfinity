#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_DIR="${RELEASE_DIR:-$ROOT_DIR/release}"
APP_NAME="${APP_NAME:-gridfinity-generator}"
PACKAGE_DIR="$RELEASE_DIR/$APP_NAME"
ARCHIVE_PATH="$RELEASE_DIR/${APP_NAME}.tar.gz"
DEPLOY_ROOT="${DEPLOY_ROOT:-}"
RUN_CHECKS="${RUN_CHECKS:-1}"

echo "[INFO] Project root: $ROOT_DIR"
echo "[INFO] Release dir: $RELEASE_DIR"

cd "$ROOT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] npm is not installed."
  exit 1
fi

echo "[INFO] Installing dependencies with npm ci..."
npm ci

if [[ "$RUN_CHECKS" == "1" ]]; then
  echo "[INFO] Running lint..."
  npm run lint

  echo "[INFO] Running unit tests..."
  npm run test:run
fi

echo "[INFO] Building production assets..."
npm run build

rm -rf "$RELEASE_DIR"
mkdir -p "$PACKAGE_DIR"

cp -R dist/. "$PACKAGE_DIR/"

cat > "$RELEASE_DIR/nginx.conf" <<EOF
server {
  listen 80;
  server_name _;

  root /var/www/${APP_NAME};
  index index.html;

  location / {
    try_files \$uri \$uri/ /index.html;
  }

  location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files \$uri =404;
  }
}
EOF

tar -czf "$ARCHIVE_PATH" -C "$RELEASE_DIR" "$APP_NAME" nginx.conf

echo "[INFO] Release package created: $ARCHIVE_PATH"
echo "[INFO] Nginx sample config: $RELEASE_DIR/nginx.conf"

if [[ -n "$DEPLOY_ROOT" ]]; then
  echo "[INFO] Deploying dist files to $DEPLOY_ROOT"
  mkdir -p "$DEPLOY_ROOT"
  cp -R "$PACKAGE_DIR"/. "$DEPLOY_ROOT"/
  echo "[INFO] Deployment copy completed."
fi

echo "[INFO] Done."
