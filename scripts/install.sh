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

PACKAGE_MANAGER=
NODE_BIN=

die() {
  echo "$1" >&2
  exit 1
}

detect_package_manager() {
  [ -n "$PACKAGE_MANAGER" ] && return 0
  if command -v apt-get >/dev/null 2>&1; then PACKAGE_MANAGER=apt
  elif command -v dnf >/dev/null 2>&1; then PACKAGE_MANAGER=dnf
  elif command -v yum >/dev/null 2>&1; then PACKAGE_MANAGER=yum
  elif command -v apk >/dev/null 2>&1; then PACKAGE_MANAGER=apk
  elif command -v pacman >/dev/null 2>&1; then PACKAGE_MANAGER=pacman
  elif command -v zypper >/dev/null 2>&1; then PACKAGE_MANAGER=zypper
  else die '无法识别 Linux 包管理器，请手动安装 Node.js 22.12+、npm 和 git。'
  fi
}

install_base_dependencies() {
  if command -v git >/dev/null 2>&1 && command -v curl >/dev/null 2>&1; then return 0; fi
  detect_package_manager
  case "$PACKAGE_MANAGER" in
    apt)
      apt-get update
      DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git
      ;;
    dnf) dnf install -y ca-certificates curl git ;;
    yum) yum install -y ca-certificates curl git ;;
    apk) apk add --no-cache ca-certificates curl git ;;
    pacman) pacman -Sy --noconfirm ca-certificates curl git ;;
    zypper) zypper --non-interactive install --no-recommends ca-certificates curl git ;;
  esac
}

node_version_ok() {
  NODE_BIN=$(command -v node 2>/dev/null) || return 1
  "$NODE_BIN" -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 12)) process.exit(1)' >/dev/null 2>&1
}

node_ready() {
  node_version_ok && command -v npm >/dev/null 2>&1
}

install_node() {
  detect_package_manager
  case "$PACKAGE_MANAGER" in
    apt)
      apt-get update
      DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl
      curl -fsSL https://deb.nodesource.com/setup_22.x | sh -
      DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
      ;;
    dnf|yum)
      curl -fsSL https://rpm.nodesource.com/setup_22.x | sh -
      if [ "$PACKAGE_MANAGER" = dnf ]; then dnf install -y nodejs
      else yum install -y nodejs
      fi
      ;;
    apk) apk add --no-cache nodejs npm ;;
    pacman) pacman -Sy --noconfirm nodejs npm ;;
    zypper) zypper --non-interactive install --no-recommends nodejs npm ;;
  esac
}

install_base_dependencies
if ! node_ready; then
  echo '正在安装或升级 Node.js 22.12+ 和 npm…'
  install_node
fi
node_ready || die '自动安装后仍未找到 Node.js 22.12+ 和 npm，请手动安装后重试。'
command -v git >/dev/null 2>&1 || die '自动安装后仍未找到 git，请手动安装后重试。'

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
