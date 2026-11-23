#!/bin/sh
set -eu
umask 077

[ "$(id -u)" = 0 ] || { echo '请以 root 运行。' >&2; exit 1; }
APP_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
NODE_BIN=$(command -v node) || { echo '请先安装 Node.js 22.12+ / 24 LTS。' >&2; exit 1; }
"$NODE_BIN" -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 12)) process.exit(1)' || { echo 'Node.js 版本过低。' >&2; exit 1; }
[ -f "$APP_DIR/dist/index.html" ] || { echo '缺少构建文件，请先 npm run build 并上传 dist。' >&2; exit 1; }
case "$APP_DIR:$NODE_BIN" in *' '*|*'"'*|*"'"*|*'%'*|*'\'*) echo '安装路径和 Node 路径不能包含空格、引号、百分号或反斜杠。' >&2; exit 1;; esac
if [ -d /run/systemd/system ]; then INIT=systemd
elif command -v rc-service >/dev/null 2>&1; then INIT=openrc
else echo '仅支持 systemd / OpenRC。' >&2; exit 1; fi
mkdir -p /etc/xray-console-ui
chmod 700 /etc/xray-console-ui
PASSWORD_EXPORT_FILE=/root/xray-console-ui-password
if [ "${PANEL_ROTATE_PASSWORD:-0}" = 1 ] || [ ! -f /etc/xray-console-ui/password ]; then
  printf '%s' '12345' > /etc/xray-console-ui/password
fi
if [ "${PANEL_ROTATE_PASSWORD:-0}" = 1 ] || [ ! -f "$PASSWORD_EXPORT_FILE" ]; then
  cp /etc/xray-console-ui/password "$PASSWORD_EXPORT_FILE"
fi
chmod 600 /etc/xray-console-ui/password "$PASSWORD_EXPORT_FILE"
if [ ! -f /etc/xray-console-ui/panel.env ]; then
  printf '%s\n' 'PANEL_PASSWORD_FILE=/etc/xray-console-ui/password' 'PANEL_HOST=0.0.0.0' 'PANEL_PORT=8787' 'PANEL_ALLOW_INSECURE_HTTP=1' > /etc/xray-console-ui/panel.env
fi
grep -q '^PANEL_HOST=' /etc/xray-console-ui/panel.env || printf '%s\n' 'PANEL_HOST=0.0.0.0' >> /etc/xray-console-ui/panel.env
grep -q '^PANEL_PORT=' /etc/xray-console-ui/panel.env || printf '%s\n' 'PANEL_PORT=8787' >> /etc/xray-console-ui/panel.env
grep -q '^PANEL_ALLOW_INSECURE_HTTP=' /etc/xray-console-ui/panel.env || printf '%s\n' 'PANEL_ALLOW_INSECURE_HTTP=1' >> /etc/xray-console-ui/panel.env
chmod 600 /etc/xray-console-ui/panel.env
if [ "$INIT" = systemd ]; then
  cat > /etc/systemd/system/xray-console-ui.service <<UNIT
[Unit]
Description=Xray Console UI
Wants=network-online.target
After=network-online.target
[Service]
Type=simple
WorkingDirectory=$APP_DIR
EnvironmentFile=/etc/xray-console-ui/panel.env
ExecStart=$NODE_BIN $APP_DIR/server/index.mjs
Restart=on-failure
RestartSec=5
UMask=0077
TimeoutStopSec=45
KillMode=control-group
[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable --now xray-console-ui
  systemctl restart xray-console-ui
  systemctl is-active --quiet xray-console-ui
else
  cat > /etc/init.d/xray-console-ui <<UNIT
#!/sbin/openrc-run
description="Xray Console UI"
directory="$APP_DIR"
command="$NODE_BIN"
command_args="$APP_DIR/server/index.mjs"
command_background=true
pidfile="/run/xray-console-ui.pid"
output_log="/var/log/xray-console-ui.log"
error_log="/var/log/xray-console-ui.log"
start_pre() {
  set -a
  . /etc/xray-console-ui/panel.env
  set +a
}
depend() {
  need net
}
UNIT
  chmod 755 /etc/init.d/xray-console-ui
  rc-update add xray-console-ui default
  rc-service xray-console-ui restart
  rc-service xray-console-ui status
fi
printf '%s\n' '面板服务已启动，监听 0.0.0.0:8787。服务器面板可将公网端口映射到 8787。' '之后在网页点击“安装 / 更新”部署代理。完整说明见 README.md。'
printf '%s\n' "管理密码文件：$PASSWORD_EXPORT_FILE"
