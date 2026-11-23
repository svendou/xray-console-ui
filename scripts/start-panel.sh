#!/bin/sh
set -eu
umask 077

[ "$(uname -s)" = Linux ] || { echo '此启动脚本只能在 Linux 上运行。' >&2; exit 1; }
[ "$(id -u)" = 0 ] || { echo '请以 root 运行面板。' >&2; exit 1; }

APP_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
NODE_BIN=$(command -v node) || { echo '请先安装 Node.js 22.12+ / 24 LTS。' >&2; exit 1; }
"$NODE_BIN" -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 12)) process.exit(1)' || {
  echo 'Node.js 版本过低，需要 22.12+ 或 24 LTS。' >&2
  exit 1
}
[ -f "$APP_DIR/dist/index.html" ] || { echo '缺少 dist/index.html，请先在本地执行 npm run build 并上传 dist。' >&2; exit 1; }

ENV_FILE=${PANEL_ENV_FILE:-/etc/xray-console-ui/panel.env}
if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi
if [ -z "${PANEL_PASSWORD_FILE:-}" ] && [ -z "${PANEL_PASSWORD:-}" ]; then
  echo "缺少管理密码，请配置 PANEL_PASSWORD_FILE 或 PANEL_PASSWORD。" >&2
  exit 1
fi

cd "$APP_DIR"
exec "$NODE_BIN" "$APP_DIR/server/index.mjs" "$@"
