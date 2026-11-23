# Xray Console UI · 个人节点管理台

基于你提供的 `deploy-personal-vpn.sh`，用 Vue 3 + TypeScript + Vite 创建的中文 Web 管理台。全深色、自适应桌面和手机。Node.js 后台使用标准库，不需要数据库。

## 部署到真实 Linux 服务器

### 一键安装

在目标 Linux 服务器上以 root 执行下面的命令：

```sh
bash <(curl -fsSL https://raw.githubusercontent.com/svendou/xray-console-ui/main/scripts/install.sh)
```

安装器会自动识别并安装 Node.js 22.12+ 和基础工具，下载 GitHub Release 的预构建包，校验后解压并启动 systemd 或 OpenRC 服务。服务器不会执行 `npm ci` 或前端构建。首次运行时会提示输入面板密码。

服务器需要运行 Linux、允许 root 操作并能够访问软件包源和 GitHub。无法识别包管理器的发行版需要手动安装依赖后再运行安装器。

维护者发布新版本时，创建并推送 `v` 开头的 Git 标签。GitHub Actions 会在构建环境完成依赖安装、前端构建和预构建包发布：

```sh
git tag v1.0.1
git push origin v1.0.1
```

### 安装开机服务

SSH 登录服务器后执行：

```sh
cd /opt/xray-console-ui
sh scripts/setup-panel.sh
```

脚本会检查 Linux 和 Node.js 版本，首次运行时设置管理密码，并安装 systemd 或 OpenRC 服务。密码保存在 `/etc/xray-console-ui/password`，默认权限为 root 可读。面板默认只监听 `127.0.0.1:8787`。

查看服务状态：

```sh
systemctl status xray-console-ui
```

### 不安装系统服务时直接启动

需要临时运行或排查时，可以使用新增的 Linux 启动脚本：

```sh
cd /opt/xray-console-ui
sh scripts/start-panel.sh
```

它会读取 `/etc/xray-console-ui/panel.env`。如果没有环境文件，需要先设置密码：

```sh
PANEL_PASSWORD_FILE=/etc/xray-console-ui/password sh scripts/start-panel.sh
```

关闭当前终端后，前台面板也会停止。长期运行使用 `setup-panel.sh` 安装系统服务。

### SSH 转发访问

在本地电脑保持以下命令运行：

```sh
ssh -N -L 8787:127.0.0.1:8787 root@YOUR_SERVER
```

然后打开 [http://127.0.0.1:8787](http://127.0.0.1:8787)。使用安装面板服务时设置的管理密码登录。进入“安装与部署”，填写服务器公网地址、端口、Cloudflare 入口和 Hy2 选项，确认后由后台执行 `deploy-personal-vpn.sh`。

公网 IPv4 或域名填写代理服务器地址，不要填写面板访问地址。NAT 端口映射和服务器防火墙需要根据你的服务商配置。

### HTTPS 域名访问

使用 Nginx 或 Caddy 终止 HTTPS，反向代理到 `127.0.0.1:8787`。编辑环境文件：

```sh
nano /etc/xray-console-ui/panel.env
```

```ini
PANEL_PASSWORD_FILE=/etc/xray-console-ui/password
PANEL_ORIGIN=https://panel.example.com
```

重启服务：

```sh
systemctl restart xray-console-ui
```

Nginx 配置示例：

```nginx
location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 3600s;
}
```

真实环境中不要把管理面板接到代理订阅使用的临时 Cloudflare 隧道上。

## 本地演示（可选）

需要 Node.js 22.12+（推荐 24 LTS）。

```powershell
cd 'E:\新建文件夹\xray-console-ui'
npm install
npm run dev
```

打开 http://127.0.0.1:5173 。`npm run dev` 同时启动前端和**演示后台**，登录账号是 `admin`，密码是 `000000`。演示包含完整的模拟安装、任务输出、服务启停和二维码；数据明确标记为模拟，不会在 Windows 上执行 Linux 安装命令。演示地址和密钥不能用于真实连接。

自动化测试执行 `npm test`。

## 已实现

- **运行总览**：CPU、内存、运行时间、组件状态；每 3 秒通过 SSE 推送。曲线展示面板启动后的实际采样，最多保留 3 分钟，可暂停显示。
- **流量与测速**：读取默认出口网卡的累计上下行流量、1 TB 额度进度、实时速率和峰值；当前网络延迟连续检测 3 次；每个节点独立显示移动、联通、电信三条 Globalping ASN 参考线路。三网公共探针不可用时明确显示暂无探针，不伪造结果。
- **安装与部署**：填写公网地址、TCP/UDP 内外端口、CF 入口、隧道协议；选择 Hy2；提交后在后台调用原脚本。脚本保留其校验和回滚行为。
- **服务管理**：全部启动、停止、重启；重建临时隧道；安装 / 单独重启 MTProto；启用或移除连接限速防护；配置 Chrony 自动校时。
- **节点与订阅**：通用订阅、Mihomo 订阅、备用直连、独立节点、TG 链接；复制、二维码、节点文件下载。
- **节点列表**：REALITY、Cloudflare、Hysteria2 分开显示服务状态、协议和监听地址；总览页和节点页共用同一列表。服务器延迟在总览页按当前访问网络检测。
- **任务与日志**：任务异步执行、实时输出、历史任务、筛选、导出；服务日志每 5 秒读取，可关闭自动刷新。
- **连接设置**：调整 CF 入口、查看端口映射、切换内核已提供的 BBR / 三方 BBR 算法、查看真实部署步骤，并提供脚本组件卸载入口。
- **登录保护**：真实模式要求至少 6 个字符的密码，HttpOnly / SameSite 会话，来源校验、访问域名校验、登录限速；HTTPS 配置下启用 Secure Cookie。

## 配置项

| 环境变量 | 默认值 | 用途 |
|---|---|---|
| `PANEL_PASSWORD_FILE` | 无 | 推荐的密码来源，读取受保护文件 |
| `PANEL_PASSWORD` | 无 | 可代替密码文件；至少 6 个字符，不要提交到仓库 |
| `PANEL_USERNAME` | `admin` | 管理账号；演示模式固定使用 `admin` |
| `PANEL_HOST` | `127.0.0.1` | 监听地址；演示版只允许本机回环 |
| `PANEL_PORT` | `8787` | 后台与生产静态页面端口 |
| `PANEL_ORIGIN` | 本机 8787 来源 | HTTPS 对外访问来源；同时放行对应 Host |
| `PANEL_DATA_DIR` | `.panel-data/live` | 私有任务历史目录；演示为 `.panel-data/demo` |
| `PANEL_NET_INTERFACE` | 自动选择默认出口 | 指定统计网卡，例如 `eth0`；Linux `/proc/net/dev` 读取 |
| `PANEL_TRAFFIC_QUOTA_BYTES` | `1099511627776` | 流量统计额度，默认 1 TiB（界面显示 1 TB） |

真实开发环境：在 Linux root 环境配置密码后运行 `npm run dev:live`。开发代理固定使用 `127.0.0.1:5173 → 127.0.0.1:8787`。

## 数据与运行约定

- 原始上传脚本保持不变。`scripts/deploy-personal-vpn.sh` 是同内容的 LF 换行副本，避免 Windows 换行影响 Linux。升级代理脚本时替换此副本后先检查兼容性。
- 网页关闭、刷新或退出登录都不取消已提交任务。不要在安装时重启后台或服务器：后台重启后将遗留任务标记“已中断”，**不自动重试**；检查服务后再决定是否重新执行。
- 单后台实例管理单服务器。应用阻止并发提交；原脚本的 `flock` 同时防止与 SSH 执行冲突。
- 任务保留最近 30 个，每个最多 500 行、每行最多 4000 字符；需要完整长期审计时增加日志归档。日志、节点和订阅都可能包含密钥，不要分享。
- 前端使用 Vue 转义输出，不把脚本日志作为 HTML；API 只接受固定命令和校验过的独立参数，不接受任意 Shell 命令。
- 节点从原脚本默认导出目录 `/var/lib/personal-vpn-stack/clients` 读取。点击「更新导出」后到任务页确认成功，再点「重新读取」。
- 服务状态是进程检查；CPU / 内存是主机读数，**不是代理流量统计**。外网连通性需要客户端实测。
- 流量卡片读取 Linux `/proc/net/dev` 的默认出口网卡，首次采样只建立基线；每日累计保存在 `.panel-data/traffic.json`。它代表整台服务器网卡流量，包含 SSH、系统更新和其他进程。要精确到 Xray / Hy2 或单个节点，需要后续增加 cgroup / nftables / eBPF 计量规则。
- “服务器延迟”由当前浏览器向面板服务器发起 3 次请求，显示平均、最低、最高和失败次数。通过公网 HTTPS 域名访问时代表当前用户网络到服务器的真实延迟；通过 SSH 本地转发时只代表本地转发链路。
- 不实现多用户、计费、流量配额或网页终端；卸载入口保留原脚本的托管范围和确认语义。

## 项目结构

```text
src/
  App.vue                管理台外壳与登录
  views/                 六个业务页面
  components/            状态标签与确认对话框
  store.ts               API、实时连接与共享状态
  tokens.css             语义化设计变量
  style.css              桌面 / 手机布局
server/
  index.mjs              启动与真实环境检查
  panel.mjs              HTTP、登录、SSE、状态采集
  jobs.mjs               任务执行状态与持久化
  policy.mjs             操作白名单与参数校验
  system.mjs             原脚本、服务状态和节点导出适配
  panel.test.mjs         核心行为测试
scripts/
  install.sh            Git 仓库一键安装脚本
  setup-panel.sh         面板初始安装与开机启动
  start-panel.sh         Linux 前台启动脚本
  deploy-personal-vpn.sh 原部署脚本副本
```

设计与产品约定见 `PRODUCT.md`、`DESIGN.md`、`.impeccable/surfaces/console.md`。这些文件应随源码保存，不要将实际 `.panel-data`、密码文件或环境配置提交到仓库。

验证范围：自动构建与后台测试、本地演示页面及交互。未提供真实服务器，因此未验证 Linux 软件包下载、服务启动、NAT、防火墙和实际代理连接。
