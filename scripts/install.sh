#!/bin/sh
set -eu
umask 077

[ "$(uname -s)" = Linux ] || { echo '此安装脚本只能在 Linux 上运行。' >&2; exit 1; }
[ "$(id -u)" = 0 ] || { echo '请以 root 运行安装脚本。' >&2; exit 1; }

REPO_URL=${1:-${XRAY_CONSOLE_REPO_URL:-}}
APP_DIR=${XRAY_CONSOLE_APP_DIR:-/opt/xray-console-ui}
[ -n "$REPO_URL" ] || { echo '用法：sh install.sh https://github.com/OWNER/REPO.git' >&2; exit 1; }
case "$REPO_URL" in
  https://*|http://*) ;;
  *) echo '仓库地址必须使用 http:// 或 https://。' >&2; exit 1 ;;
esac

NODE_BIN=$(command -v node) || { echo '请先安装 Node.js 22.12+ / 24 LTS。' >&2; exit 1; }
"$NODE_BIN" -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 12)) process.exit(1)' || {
  echo 'Node.js 版本过低，需要 22.12+ 或 24 LTS。' >&2
  exit 1
}
command -v git >/dev/null 2>&1 || { echo '请先安装 git。' >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo '请先安装 npm。' >&2; exit 1; }

case "$APP_DIR" in
  /*) ;;
  *) echo 'XRAY_CONSOLE_APP_DIR 必须是绝对路径。' >&2; exit 1 ;;
esac

if [ -e "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
elif [ -e "$APP_DIR" ]; then
  echo "$APP_DIR 已存在且不是 Git 仓库，请先处理该目录。" >&2
  exit 1
else
  mkdir -p "$(dirname -- "$APP_DIR")"
  git clone --depth=1 "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
[ -f package-lock.json ] || { echo '仓库缺少 package-lock.json。' >&2; exit 1; }
[ -f scripts/setup-panel.sh ] || { echo '仓库缺少 scripts/setup-panel.sh。' >&2; exit 1; }
npm ci
npm run build
sh scripts/setup-panel.sh

printf '%s\n' 'Xray Console UI 面板已安装并启动。' '默认监听 127.0.0.1:8787，请使用 SSH 转发访问。' '之后在面板中点击“安装 / 更新”部署代理。'
