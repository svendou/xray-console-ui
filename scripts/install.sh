#!/bin/sh
set -eu
umask 077

[ "$(uname -s)" = Linux ] || { echo '此安装脚本只能在 Linux 上运行。' >&2; exit 1; }
[ "$(id -u)" = 0 ] || { echo '请以 root 运行安装脚本。' >&2; exit 1; }

APP_DIR=${XRAY_CONSOLE_APP_DIR:-/opt/xray-console-ui}
VERSION=${XRAY_CONSOLE_VERSION:-latest}
RELEASE_URL=${XRAY_CONSOLE_RELEASE_URL:-}
RELEASE_BASE_URL=${XRAY_CONSOLE_RELEASE_BASE_URL:-https://github.com/svendou/xray-console-ui/releases/download}
LATEST_RELEASE_URL=${XRAY_CONSOLE_LATEST_URL:-https://api.github.com/repos/svendou/xray-console-ui/releases/latest}
ACTION=${1:-menu}

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

panel_exists() {
  [ -f "$APP_DIR/.xray-console-ui-release" ] || { [ -f "$APP_DIR/package.json" ] && [ -f "$APP_DIR/scripts/setup-panel.sh" ]; }
}

service_action() {
  command=$1
  if [ -d /run/systemd/system ] && command -v systemctl >/dev/null 2>&1; then
    systemctl "$command" xray-console-ui
  elif command -v rc-service >/dev/null 2>&1; then
    rc-service xray-console-ui "$command"
  else
    die '未找到 systemd 或 OpenRC 服务管理器。'
  fi
}

show_deploy_script() {
  script="$APP_DIR/scripts/deploy-personal-vpn.sh"
  if [ -f "$script" ]; then
    if command -v less >/dev/null 2>&1; then less "$script"; else cat "$script"; fi
    return 0
  fi
  command -v curl >/dev/null 2>&1 || die '查看远程脚本需要 curl。'
  if command -v less >/dev/null 2>&1; then
    curl -fsSL https://raw.githubusercontent.com/svendou/xray-console-ui/main/scripts/deploy-personal-vpn.sh | less
  else
    curl -fsSL https://raw.githubusercontent.com/svendou/xray-console-ui/main/scripts/deploy-personal-vpn.sh
  fi
}

show_menu() {
  echo
  echo 'Xray Console UI 管理器'
  echo '1) 安装面板'
  echo '2) 更新面板'
  echo '3) 停止面板'
  echo '4) 查看部署脚本'
  echo '5) 查看面板状态'
  echo '0) 退出'
  printf '请选择：'
  if [ -t 0 ]; then read -r choice
  elif [ -r /dev/tty ]; then read -r choice < /dev/tty
  else die '当前终端不支持交互菜单，请传入 install、update、stop、script 或 status。'
  fi
  case "$choice" in
    1) ACTION=install ;;
    2) ACTION=update ;;
    3) ACTION=stop ;;
    4) ACTION=script ;;
    5) ACTION=status ;;
    0) exit 0 ;;
    *) die '无效选择。' ;;
  esac
}

[ "$ACTION" = menu ] && show_menu
case "$ACTION" in
  install|update|stop|script|status) ;;
  *) die '用法：install.sh [install|update|stop|script|status]。' ;;
esac

if [ "$ACTION" = stop ]; then
  service_action stop
  echo 'Xray Console UI 已停止。'
  exit 0
fi
if [ "$ACTION" = status ]; then
  service_action status
  exit 0
fi
if [ "$ACTION" = script ]; then
  show_deploy_script
  exit 0
fi
if [ "$ACTION" = install ] && panel_exists; then
  die "$APP_DIR 已安装，请选择 update 更新面板。"
fi
if [ "$ACTION" = update ] && ! panel_exists; then
  die "$APP_DIR 尚未安装，请选择 install 安装面板。"
fi

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
    latest_json=$(curl -fsSL -H 'Accept: application/vnd.github+json' -H 'User-Agent: xray-console-ui-installer' "$LATEST_RELEASE_URL") || die '无法获取 GitHub 最新 Release。'
    VERSION=$(printf '%s' "$latest_json" | "$NODE_BIN" -e 'let s=""; process.stdin.on("data", chunk => s += chunk).on("end", () => process.stdout.write(JSON.parse(s).tag_name || ""))') || die '无法解析 GitHub 最新 Release。'
    case "$VERSION" in
      v[0-9]*.[0-9]*.[0-9]*) ;;
      *) die 'GitHub 最新 Release 标签无效。' ;;
    esac
  fi
  RELEASE_URL="$RELEASE_BASE_URL/$VERSION/xray-console-ui.tar.gz"
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

PANEL_ROTATE_PASSWORD=1 sh "$APP_DIR/scripts/setup-panel.sh"
printf '%s\n' 'Xray Console UI 面板已安装并启动。' '监听 0.0.0.0:8787，服务器面板可将公网端口映射到内部 8787。' '之后在面板中点击“安装 / 更新”部署代理。'
