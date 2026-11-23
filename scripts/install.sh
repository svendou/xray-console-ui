#!/bin/sh
set -eu
umask 077

[ "$(uname -s)" = Linux ] || { echo '此安装脚本只能在 Linux 上运行。' >&2; exit 1; }
[ "$(id -u)" = 0 ] || { echo '请以 root 运行安装脚本。' >&2; exit 1; }

APP_DIR=${XRAY_CONSOLE_APP_DIR:-/opt/xray-console-ui}
VERSION=${XRAY_CONSOLE_VERSION:-latest}
RELEASE_URL=${XRAY_CONSOLE_RELEASE_URL:-}
RELEASE_BASE_URL=${XRAY_CONSOLE_RELEASE_BASE_URL:-https://github.com/svendou/xray-console-ui/releases/download}

die() {
  echo "$1" >&2
  exit 1
}

case "$APP_DIR" in
  /*) ;;
  *) die 'XRAY_CONSOLE_APP_DIR 必须是绝对路径。' ;;
esac
case "$VERSION" in
  ''|*[!A-Za-z0-9._-]*) die 'XRAY_CONSOLE_VERSION 包含无效字符。' ;;
esac

PACKAGE_MANAGER=

detect_package_manager() {
  [ -n "$PACKAGE_MANAGER" ] && return 0
  if command -v apt-get >/dev/null 2>&1; then PACKAGE_MANAGER=apt
  elif command -v dnf >/dev/null 2>&1; then PACKAGE_MANAGER=dnf
  elif command -v yum >/dev/null 2>&1; then PACKAGE_MANAGER=yum
  elif command -v apk >/dev/null 2>&1; then PACKAGE_MANAGER=apk
  elif command -v pacman >/dev/null 2>&1; then PACKAGE_MANAGER=pacman
  elif command -v zypper >/dev/null 2>&1; then PACKAGE_MANAGER=zypper
  else die '无法识别 Linux 包管理器，请手动安装 Node.js 22.12+。'
  fi
}

install_base_dependencies() {
  if command -v curl >/dev/null 2>&1 && command -v tar >/dev/null 2>&1; then return 0; fi
  detect_package_manager
  case "$PACKAGE_MANAGER" in
    apt)
      apt-get update
      DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl tar
      ;;
    dnf) dnf install -y ca-certificates curl tar ;;
    yum) yum install -y ca-certificates curl tar ;;
    apk) apk add --no-cache ca-certificates curl tar ;;
    pacman) pacman -Sy --noconfirm ca-certificates curl tar ;;
    zypper) zypper --non-interactive install --no-recommends ca-certificates curl tar ;;
  esac
}

node_version_ok() {
  NODE_BIN=$(command -v node 2>/dev/null) || return 1
  "$NODE_BIN" -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 12)) process.exit(1)' >/dev/null 2>&1
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
    apk) apk add --no-cache nodejs ;;
    pacman) pacman -Sy --noconfirm nodejs ;;
    zypper) zypper --non-interactive install --no-recommends nodejs ;;
  esac
}

install_base_dependencies
if ! node_version_ok; then
  echo '正在安装或升级 Node.js 22.12+…'
  install_node
fi
node_version_ok || die '自动安装后仍未找到 Node.js 22.12+，请手动安装后重试。'

if [ -z "$RELEASE_URL" ]; then
  if [ "$VERSION" = latest ]; then
    RELEASE_URL="$RELEASE_BASE_URL/latest/download/xray-console-ui.tar.gz"
  else
    RELEASE_URL="$RELEASE_BASE_URL/$VERSION/xray-console-ui.tar.gz"
  fi
fi
CHECKSUM_URL=${XRAY_CONSOLE_CHECKSUM_URL:-${RELEASE_URL%.tar.gz}.sha256}

TEMP_DIR=$(mktemp -d)
cleanup() { rm -rf "$TEMP_DIR"; }
trap cleanup EXIT HUP INT TERM

echo '正在下载 Xray Console UI 预构建包…'
curl -fL --retry 3 --retry-delay 1 "$RELEASE_URL" -o "$TEMP_DIR/xray-console-ui.tar.gz" || die '预构建发布包下载失败，请先发布 GitHub Release。'
curl -fL --retry 3 --retry-delay 1 "$CHECKSUM_URL" -o "$TEMP_DIR/xray-console-ui.sha256" || die '发布包校验文件下载失败。'
(
  cd "$TEMP_DIR"
  sha256sum -c xray-console-ui.sha256
) || die '预构建发布包校验失败。'

tar -xzf "$TEMP_DIR/xray-console-ui.tar.gz" -C "$TEMP_DIR"
PACKAGE_DIR="$TEMP_DIR/xray-console-ui"
[ -f "$PACKAGE_DIR/dist/index.html" ] || die '发布包缺少 dist/index.html。'
[ -f "$PACKAGE_DIR/server/index.mjs" ] || die '发布包缺少 server/index.mjs。'
[ -f "$PACKAGE_DIR/scripts/setup-panel.sh" ] || die '发布包缺少 scripts/setup-panel.sh。'

if [ -e "$APP_DIR" ]; then
  if [ ! -f "$APP_DIR/.xray-console-ui-release" ]; then
    [ -f "$APP_DIR/package.json" ] && [ -f "$APP_DIR/scripts/setup-panel.sh" ] || die "$APP_DIR 已存在且不是 Xray Console UI 目录，请先处理该目录。"
    echo '检测到旧版源码目录，将覆盖面板运行文件。'
  fi
else
  mkdir -p "$APP_DIR"
fi
cp -a "$PACKAGE_DIR/." "$APP_DIR/"
printf '%s\n' "$VERSION" > "$APP_DIR/.xray-console-ui-release"
chmod 600 "$APP_DIR/.xray-console-ui-release"

sh "$APP_DIR/scripts/setup-panel.sh"
printf '%s\n' 'Xray Console UI 面板已安装并启动。' '默认监听 127.0.0.1:8787，请使用 SSH 转发访问。' '之后在面板中点击“安装 / 更新”部署代理。'
