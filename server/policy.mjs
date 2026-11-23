import { isIP } from 'node:net'

export const actions = {
  install: '安装 / 更新节点', status: '检查详细状态', start: '启动全部服务', stop: '停止全部服务', restart: '重启代理与订阅',
  'restart-tunnel': '重建 Cloudflare 隧道', 'set-entry': '修改 CF 入口', export: '更新节点与订阅',
  mtproto: '安装 / 更新 Telegram 代理', 'mtproto-restart': '重启 Telegram 代理',
  'mtproto-protect': '启用 TG 连接防护', 'mtproto-unprotect': '移除 TG 连接防护', 'time-sync': '配置自动校时',
  'xray-restart': '单独重启 Xray', 'hy2-restart': '单独重启 Hysteria2', 'set-congestion': '设置内核拥塞控制', 'set-qdisc': '设置队列调度',
  'bbr-profile': '安装 BBR V3 内核', 'bbr-menu': '执行 BBR 脚本菜单', 'bbr-smart': '配置 BBR V3 智能优化', 'update-xray': '更新 Xray', 'update-hy2': '更新 Hysteria2', 'update-cloudflare': '更新 Cloudflared', uninstall: '卸载全部组件',
}
export function validHost(value) {
  return typeof value === 'string' && value.length <= 253 && (isIP(value) === 4 ||
    /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(value))
}
function host(value, label) {
  if (!validHost(value)) throw new Error(`${label}请输入 IPv4 或域名，不含协议、路径或端口。`)
  return value
}
function port(value) {
  if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error('端口必须是 1024–65535 的整数。')
  return String(value)
}
function outputDir(value) {
  if (value === undefined || value === '') return ''
  if (typeof value !== 'string' || !value.startsWith('/') || value === '/' || value.includes('\n')) throw new Error('节点导出目录必须是绝对路径，且不能是根目录。')
  return value
}
export function buildArgs(action, params = {}) {
  if (!Object.hasOwn(actions, action)) throw new Error('不支持的操作。')
  if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error('参数格式错误。')
  const args = [action]
  if (action === 'set-entry') {
    args.push('--cf-entry', params.cfEntry === 'auto' ? 'auto' : host(params.cfEntry, 'CF 入口'))
  }
  if (action === 'set-congestion') {
    const value = params.algorithm
    if (typeof value !== 'string' || !/^[a-z0-9_+-]{1,32}$/.test(value)) throw new Error('拥塞控制名称无效。')
    args.push('--algorithm', value)
  }
  if (action === 'set-qdisc') {
    const value = params.qdisc
    if (typeof value !== 'string' || !['fq', 'fq_codel', 'fq_pie', 'cake'].includes(value)) throw new Error('队列调度算法无效。')
    args.push('--qdisc', value)
  }
  if (action === 'bbr-profile') {
    if (!['standard', 'max'].includes(params.profile)) throw new Error('BBR V3 版本无效。')
    args.push('--profile', params.profile)
  }
  if (action === 'bbr-menu') {
    if (!['8', '9', '11', '12', '13', '14'].includes(params.menu)) throw new Error('BBR 脚本菜单无效。')
    args.push('--menu', params.menu)
  }
  if (action === 'bbr-smart') {
    if (!['asia', 'overseas'].includes(params.region)) throw new Error('线路模式无效。')
    if (!Number.isInteger(params.rttMs) || params.rttMs < 1 || params.rttMs > 5000) throw new Error('真实 RTT 必须是 1–5000 的整数。')
    args.push('--region', params.region, '--rtt-ms', String(params.rttMs))
  }
  if (action === 'mtproto') {
    if (params.mtprotoPort !== undefined || params.mtprotoPublicPort !== undefined) {
      args.push('--mtproto-port', port(params.mtprotoPort), '--mtproto-public-port', port(params.mtprotoPublicPort))
    }
  }
  if (action === 'install') {
    args.push('--server', host(params.server, '服务器地址'))
    const ports = {
      realityPort: '--reality-port', publicPort: '--public-port', hy2Port: '--hy2-port',
      hy2PublicPort: '--hy2-public-port', subscriptionPort: '--subscription-port', subscriptionPublicPort: '--subscription-public-port',
    }
    if (typeof params.hy2 !== 'boolean') throw new Error('请选择是否启用 Hysteria2。')
    for (const [key, flag] of Object.entries(ports)) args.push(flag, port(params[key]))
    if ([params.realityPort, params.subscriptionPort].some(p => [48089, 48090].includes(p)) || params.realityPort === params.subscriptionPort || params.publicPort === params.subscriptionPublicPort) {
      throw new Error('TCP 端口冲突，请避开本地 WS 48089、健康检查 48090，保持 REALITY 与订阅端口不同，并避免公网端口重复。')
    }
    args.push('--cf-entry', params.cfEntry === 'auto' ? 'auto' : host(params.cfEntry, 'CF 入口'))
    if (!['http2', 'quic'].includes(params.tunnelProtocol)) throw new Error('隧道协议无效。')
    args.push('--tunnel-protocol', params.tunnelProtocol, params.hy2 ? '--enable-hy2' : '--disable-hy2')
    const directory = outputDir(params.outputDir)
    if (directory) args.push('--output', directory)
  }
  return args
}
