#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

CONFIG_DIR=${XRAY_PROXY_CONFIG_DIR:-/etc/mihomo}
CONFIG_FILE="$CONFIG_DIR/config.yaml"
BINARY=${XRAY_PROXY_BINARY:-/usr/local/bin/mihomo}
SERVICE_NAME=xray-console-linux-proxy
SUBSCRIPTION_URL=
MODE=menu
TEMP_DIR=
TEMP_PID=

say() { printf '[xray-proxy] %s\n' "$*"; }
die() { say "$*" >&2; exit 1; }
usage() {
  cat <<'HELP'
用法：
  linux-proxy-client.sh --subscription-url URL
  linux-proxy-client.sh --subscription-url URL --mode temporary|service
  linux-proxy-client.sh --mode status|uninstall

选项：
  --subscription-url URL  Clash / Mihomo 订阅地址
  --mode MODE             temporary、service、status 或 uninstall
HELP
}
require_root() { [ "$(id -u)" -eq 0 ] || die '此操作需要 root 权限。'; }
require_tools() {
  command -v curl >/dev/null 2>&1 || die '缺少 curl，请先安装 curl。'
  command -v gzip >/dev/null 2>&1 || die '缺少 gzip，请先安装 gzip。'
}
validate_url() {
  [ -n "$SUBSCRIPTION_URL" ] || die '请提供 Clash / Mihomo 订阅地址。'
  case "$SUBSCRIPTION_URL" in http://*|https://*) ;; *) die '订阅地址必须是 http 或 https。' ;; esac
}
architecture() {
  case "$(uname -m)" in
    x86_64|amd64) printf 'amd64' ;;
    aarch64|arm64) printf 'arm64' ;;
    *) die "不支持的 CPU 架构：$(uname -m)" ;;
  esac
}
latest_binary_url() {
  local arch="$1" metadata url
  metadata=$(curl -fsSL --retry 3 --connect-timeout 10 --max-time 30 \
    -H 'Accept: application/vnd.github+json' -H 'User-Agent: xray-console-ui' \
    https://api.github.com/repos/MetaCubeX/mihomo/releases/latest) || die '无法获取 Mihomo 最新版本。'
  url=$(printf '%s' "$metadata" | grep -oE 'https://github\.com/MetaCubeX/mihomo/releases/download/[^" ]+/mihomo-linux-[^" ]+\.gz' | grep "mihomo-linux-${arch}" | head -n 1 || true)
  [ -n "$url" ] || die "没有找到 ${arch} 的 Mihomo 安装包。"
  printf '%s' "$url"
}
download_binary() {
  local target="$1" temp url
  temp=$(mktemp -d)
  trap 'rm -rf "$temp"' RETURN
  url=$(latest_binary_url "$(architecture)")
  say '正在下载 Mihomo 客户端…'
  curl -fL --retry 3 --connect-timeout 10 --max-time 180 "$url" -o "$temp/mihomo.gz" || die 'Mihomo 下载失败。'
  gzip -dc "$temp/mihomo.gz" > "$target" || die 'Mihomo 解压失败。'
  chmod 0755 "$target"
  trap - RETURN
  rm -rf "$temp"
}
resolve_binary() {
  if command -v mihomo >/dev/null 2>&1; then BINARY=$(command -v mihomo); fi
  [ -x "$BINARY" ] || return 1
}
ensure_service_binary() {
  require_root
  require_tools
  if ! resolve_binary; then
    mkdir -p "$(dirname "$BINARY")"
    download_binary "$BINARY"
  fi
  say "Mihomo：$BINARY"
}
download_config() {
  local directory="$1"
  validate_url
  mkdir -p "$directory"
  chmod 700 "$directory"
  say '正在下载订阅配置…'
  curl -fsSL --retry 3 --connect-timeout 10 --max-time 90 "$SUBSCRIPTION_URL" -o "$directory/config.yaml" || die '订阅配置下载失败。'
  grep -q '^proxies:' "$directory/config.yaml" || die '下载内容不是有效的 Mihomo 配置。'
  chmod 600 "$directory/config.yaml"
}
wait_for_proxy() {
  local attempt
  for attempt in $(seq 1 20); do
    if curl -fsS --proxy http://127.0.0.1:7890 --connect-timeout 5 --max-time 12 \
      https://www.google.com/generate_204 -o /dev/null; then
      say '代理检测通过，当前 Mihomo 已能访问外网。'
      return 0
    fi
    sleep 1
  done
  say '代理进程已启动，但外网检测未通过。请查看 Mihomo 日志和代理组选择。'
  return 1
}
write_systemd_service() {
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<UNIT
[Unit]
Description=Xray Console Linux Mihomo Proxy
Wants=network-online.target
After=network-online.target
[Service]
Type=simple
WorkingDirectory=$CONFIG_DIR
ExecStart=$BINARY -d $CONFIG_DIR
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable --now "$SERVICE_NAME"
}
write_openrc_service() {
  cat > "/etc/init.d/$SERVICE_NAME" <<UNIT
#!/sbin/openrc-run
description="Xray Console Linux Mihomo Proxy"
directory="$CONFIG_DIR"
command="$BINARY"
command_args="-d $CONFIG_DIR"
command_background=true
pidfile="/run/$SERVICE_NAME.pid"
output_log="/var/log/$SERVICE_NAME.log"
error_log="/var/log/$SERVICE_NAME.log"
depend() { need net; }
UNIT
  chmod 0755 "/etc/init.d/$SERVICE_NAME"
  rc-update add "$SERVICE_NAME" default >/dev/null
  rc-service "$SERVICE_NAME" restart
}
start_service() {
  if [ -d /run/systemd/system ] && command -v systemctl >/dev/null 2>&1; then
    write_systemd_service
  elif command -v rc-service >/dev/null 2>&1; then
    write_openrc_service
  else
    die '没有找到 systemd 或 OpenRC。'
  fi
}
stop_service() {
  if [ -d /run/systemd/system ] && command -v systemctl >/dev/null 2>&1; then
    systemctl disable --now "$SERVICE_NAME" 2>/dev/null || true
    rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
    systemctl daemon-reload
  elif command -v rc-service >/dev/null 2>&1; then
    rc-service "$SERVICE_NAME" stop 2>/dev/null || true
    rc-update del "$SERVICE_NAME" default 2>/dev/null || true
    rm -f "/etc/init.d/$SERVICE_NAME"
  fi
}
run_temporary() {
  require_tools
  TEMP_DIR=$(mktemp -d)
  trap 'if [ -n "$TEMP_PID" ]; then kill "$TEMP_PID" 2>/dev/null || true; wait "$TEMP_PID" 2>/dev/null || true; fi; rm -rf "$TEMP_DIR"' EXIT INT TERM
  if resolve_binary; then
    say "使用已有 Mihomo：$BINARY"
  else
    BINARY="$TEMP_DIR/mihomo"
    download_binary "$BINARY"
  fi
  download_config "$TEMP_DIR"
  "$BINARY" -d "$TEMP_DIR" >"$TEMP_DIR/mihomo.log" 2>&1 &
  TEMP_PID=$!
  wait_for_proxy || true
  printf '\n'
  say '已进入临时代理终端，HTTP、HTTPS 和 SOCKS5 均指向 127.0.0.1:7890。'
  say '输入 exit 退出临时终端，Mihomo 会随之停止。'
  export http_proxy=http://127.0.0.1:7890
  export https_proxy=http://127.0.0.1:7890
  export all_proxy=socks5h://127.0.0.1:7890
  export HTTP_PROXY="$http_proxy" HTTPS_PROXY="$https_proxy" ALL_PROXY="$all_proxy"
  bash --noprofile --norc -i
}
run_service() {
  require_root
  ensure_service_binary
  download_config "$CONFIG_DIR"
  touch "$CONFIG_DIR/.xray-console-managed"
  start_service
  say '长期代理服务已启动。'
  wait_for_proxy || true
  say "配置文件：$CONFIG_FILE"
  say "服务名称：$SERVICE_NAME"
}
show_status() {
  if resolve_binary; then say "Mihomo：$BINARY"; else say 'Mihomo：未安装'; fi
  [ -f "$CONFIG_FILE" ] && say "配置：$CONFIG_FILE" || say '配置：未找到'
  if [ -d /run/systemd/system ] && command -v systemctl >/dev/null 2>&1; then
    systemctl --no-pager --full status "$SERVICE_NAME" 2>/dev/null || true
  elif command -v rc-service >/dev/null 2>&1; then
    rc-service "$SERVICE_NAME" status 2>/dev/null || true
  fi
}
uninstall_client() {
  require_root
  stop_service
  if [ -f "$CONFIG_DIR/.xray-console-managed" ]; then rm -f "$BINARY"; fi
  rm -rf "$CONFIG_DIR"
  say 'Linux Mihomo 代理客户端已卸载。'
}
menu() {
  while true; do
    printf '\nXray Linux 代理客户端\n1) 临时使用（退出终端即停止）\n2) 长期服务（开机自启）\n3) 卸载客户端\n4) 查看状态\n0) 退出\n请选择：'
    read -r choice
    case "$choice" in
      1) run_temporary; return ;;
      2) run_service; return ;;
      3) uninstall_client; return ;;
      4) show_status ;;
      0) return ;;
      *) say '无效选择。' ;;
    esac
  done
}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --subscription-url|--url) [ "$#" -ge 2 ] || die "$1 缺少参数。"; SUBSCRIPTION_URL=$2; shift 2 ;;
    --mode) [ "$#" -ge 2 ] || die '--mode 缺少参数。'; MODE=$2; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "未知参数：$1" ;;
  esac
done
case "$MODE" in
  menu) menu ;;
  temporary) run_temporary ;;
  service|persistent) run_service ;;
  status) show_status ;;
  uninstall|remove) uninstall_client ;;
  *) die "不支持的模式：$MODE" ;;
esac
