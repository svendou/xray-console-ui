import os from 'node:os'
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { createInterface } from 'node:readline'
import { nodeStats, nodeDefinitions } from './node-stats.mjs'

const exec = promisify(execFile)
export const defaults = {
  server: '', reality_port: 43526, public_port: 43526, hy2_port: 43526, hy2_public_port: 43526,
  subscription_port: 43518, subscription_public_port: 43518, output_dir: '', cf_entry: 'cdns.doon.eu.org', hy2_enabled: true, tunnel_protocol: 'http2',
}
const definitions = [
  ['xray', 'Xray Core', 'VLESS · REALITY / WebSocket', 'personal-vpn-stack', 'xray_version'],
  ['cloudflare', 'Cloudflare Tunnel', '加密隧道 · WebSocket 入口', 'personal-vpn-stack-cloudflare', 'cloudflared_version'],
  ['hy2', 'Hysteria 2', 'UDP · 高速直连', 'personal-vpn-stack-hy2', 'hy2_version'],
  ['subscription', 'Subscription', '通用 / Mihomo 订阅', 'personal-vpn-stack-subscription', ''],
  ['mtproto', 'Telegram Proxy', 'MTProto · Telegram 专用', 'personal-vpn-stack-mtproto', ''],
]
export function readText(path) { try { return readFileSync(path, 'utf8').trim() } catch (e) { if (e.code === 'ENOENT') return ''; throw e } }
export function readSettings() {
  const value = readText('/etc/personal-vpn-stack/settings.json')
  return value ? { ...defaults, ...JSON.parse(value) } : { ...defaults }
}
function portFor(id, settings, mt) {
  return ({ xray: `TCP ${settings.reality_port}`, cloudflare: `${settings.tunnel_protocol.toUpperCase()}`, hy2: `UDP ${settings.hy2_port}`, subscription: `TCP ${settings.subscription_port}`, mtproto: mt ? `TCP ${mt.port}` : '—' })[id]
}
export function servicesFor(settings, states, mt) {
  return definitions.map(([id, name, description, , version]) => ({ id, name, description, state: states[id] ?? 'missing', port: portFor(id, settings, mt), version: settings[version] || (id === 'subscription' ? 'Python 3' : '—') }))
}
function releaseVersion(value) {
  const match = String(value || '').match(/\d+(?:\.\d+)+/)
  return match ? match[0].split('.').map(Number) : []
}
function newerVersion(latest, current) {
  const next = releaseVersion(latest), installed = releaseVersion(current)
  if (!next.length || !installed.length) return false
  for (let index = 0; index < Math.max(next.length, installed.length); index += 1) {
    const left = next[index] || 0, right = installed[index] || 0
    if (left !== right) return left > right
  }
  return false
}
function displayRelease(value) { return value ? String(value).replace(/^app\//, '') : null }
async function latestRelease(repo, signal) {
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'xray-console-ui' }, signal })
    if (!response.ok) return null
    const value = await response.json()
    return typeof value.tag_name === 'string' ? value.tag_name : null
  } catch { return null }
}
export async function checkServiceUpdates(services, demo = false) {
  const current = Object.fromEntries((services || []).map(service => [service.id, service.version]))
  if (demo) return {
    checkedAt: new Date().toISOString(), services: {
      xray: { current: current.xray || '—', latest: 'v26.12.0', available: true, source: '演示数据' },
      hy2: { current: current.hy2 || '—', latest: 'v2.14.0', available: true, source: '演示数据' },
      cloudflare: { current: current.cloudflare || '—', latest: '2026.12.0', available: true, source: '演示数据' },
      subscription: { current: current.subscription || 'Python 3', latest: null, available: false, source: '订阅内容可手动更新' },
    },
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  const [xrayTag, hy2Tag, cloudflareTag] = await Promise.all([latestRelease('XTLS/Xray-core', controller.signal), latestRelease('apernet/hysteria', controller.signal), latestRelease('cloudflare/cloudflared', controller.signal)])
  clearTimeout(timeout)
  const source = xrayTag || hy2Tag || cloudflareTag ? 'GitHub Releases' : '暂时无法连接 GitHub'
  const xrayLatest = displayRelease(xrayTag), hy2Latest = displayRelease(hy2Tag), cloudflareLatest = displayRelease(cloudflareTag)
  return {
    checkedAt: new Date().toISOString(), services: {
      xray: { current: current.xray || '—', latest: xrayLatest, available: newerVersion(xrayLatest, current.xray), source },
      hy2: { current: current.hy2 || '—', latest: hy2Latest, available: newerVersion(hy2Latest, current.hy2), source },
      cloudflare: { current: current.cloudflare || '—', latest: cloudflareLatest, available: newerVersion(cloudflareLatest, current.cloudflare), source },
      subscription: { current: current.subscription || 'Python 3', latest: null, available: false, source: '订阅内容可手动更新' },
    },
  }
}
export async function realServices(settings) {
  const openrc = existsSync('/sbin/openrc') && !existsSync('/run/systemd/system')
  const states = {}
  await Promise.all(definitions.map(async ([id, , , unit]) => {
    if (!existsSync(openrc ? `/etc/init.d/${unit}` : `/etc/systemd/system/${unit}.service`)) { states[id] = 'missing'; return }
    try {
      if (openrc) { await exec('rc-service', [unit, 'status'], { timeout: 2000 }); states[id] = 'running' }
      else {
        const { stdout } = await exec('systemctl', ['show', `${unit}.service`, '--property=ActiveState', '--value'], { timeout: 2000 })
        states[id] = stdout.trim() === 'active' ? 'running' : 'stopped'
      }
    } catch (error) { states[id] = openrc && [1, 3].includes(error.code) ? 'stopped' : 'unknown' }
    if (id === 'hy2' && !settings.hy2_enabled) states[id] = 'disabled'
  }))
  const mtText = readText('/etc/personal-vpn-stack/mtproto.json')
  return servicesFor(settings, states, mtText ? JSON.parse(mtText) : null)
}
export function executeScript(script) {
  const children = new Set()
  const run = (args, append) => new Promise(resolve => {
    const env = { ...process.env, PERSONAL_VPN_INTERACTIVE: '0', TERM: 'dumb' }
    if (args[0] === 'uninstall') env.PERSONAL_VPN_CONFIRM = '1'
    delete env.PANEL_PASSWORD
    const child = spawn('sh', [script, ...args], { shell: false, env, stdio: ['ignore', 'pipe', 'pipe'] })
    children.add(child)
    for (const output of [child.stdout, child.stderr]) createInterface({ input: output }).on('line', append)
    child.on('error', e => { append(`无法启动安装脚本：${e.message}`); resolve(1) })
    child.on('close', code => { children.delete(child); resolve(code ?? 1) })
  })
  run.stop = () => { for (const child of children) child.kill('SIGTERM') }
  return run
}
export function cpuTimes() {
  return os.cpus().reduce((result, cpu) => ({ idle: result.idle + cpu.times.idle, total: result.total + Object.values(cpu.times).reduce((a, b) => a + b, 0) }), { idle: 0, total: 0 })
}
export function nodeExports(demo) {
  if (demo) return {
    subscription: 'https://example.trycloudflare.com/demo-subscription-token',
    mihomo: 'https://example.trycloudflare.com/demo-subscription-token?format=clash',
    direct: 'http://203.0.113.24:43518/demo-subscription-token',
    nodes: [
      { name: 'REALITY', protocol: 'VLESS / REALITY', value: 'vless://00000000-0000-4000-8000-000000000001@203.0.113.24:43526?encryption=none&security=reality&sni=www.cloudflare.com&fp=chrome&type=tcp&flow=xtls-rprx-vision&pbk=DEMO#Xray-REALITY' },
      { name: 'CF', protocol: 'VLESS / WebSocket', value: 'vless://00000000-0000-4000-8000-000000000001@cdns.doon.eu.org:443?encryption=none&security=tls&type=ws&host=example.trycloudflare.com&path=%2Fdemo#Xray-CF' },
      { name: 'Hy2', protocol: 'Hysteria 2 / UDP', value: 'hysteria2://demo-password@203.0.113.24:43526?sni=www.cloudflare.com#Xray-Hy2' },
    ],
    telegram: 'tg://proxy?server=203.0.113.24&port=53528&secret=demo',
  }
  const settings = readSettings()
  const directory = settings.output_dir || '/var/lib/personal-vpn-stack/clients'
  const nodes = ['REALITY', 'CF', 'Hy2'].map(name => ({ name, protocol: { REALITY: 'VLESS / REALITY', CF: 'VLESS / WebSocket', Hy2: 'Hysteria 2 / UDP' }[name], value: readText(join(directory, `${name}-node.txt`)) })).filter(n => n.value)
  const mt = readText('/etc/personal-vpn-stack/mtproto.json')
  const config = mt ? JSON.parse(mt) : null
  return { subscription: readText(join(directory, 'subscription-url.txt')), mihomo: readText(join(directory, 'subscription-clash-url.txt')), direct: readText(join(directory, 'subscription-direct-url.txt')), nodes,
    telegram: config ? `tg://proxy?server=${encodeURIComponent(settings.server)}&port=${config.public_port}&secret=${encodeURIComponent(config.secret)}` : '' }
}
export async function serviceLogs() {
  if (existsSync('/run/systemd/system')) {
    const units = definitions.flatMap(([, , , unit]) => ['-u', `${unit}.service`])
    const { stdout } = await exec('journalctl', [...units, '-n', '150', '--no-pager', '-o', 'short-iso'], { timeout: 5000, maxBuffer: 256 * 1024 })
    const cloudflare = readText('/run/personal-vpn-stack/cloudflare.log').split('\n').filter(Boolean).slice(-60).map(line => `[cloudflare] ${line}`)
    return [...stdout.split('\n').filter(Boolean).slice(-150), ...cloudflare].slice(-150)
  }
  return definitions.flatMap(([id]) => {
    const file = id === 'xray' ? 'xray' : id
    return readText(`/run/personal-vpn-stack/${file}.log`).split('\n').filter(Boolean).slice(-30).map(line => `[${id}] ${line}`)
  }).slice(-150)
}
export async function kernelCongestion() {
  const current = readText('/proc/sys/net/ipv4/tcp_congestion_control') || 'unknown'
  const allowed = readText('/proc/sys/net/ipv4/tcp_allowed_congestion_control').split(/\s+/).filter(Boolean)
  const qdisc = readText('/proc/sys/net/core/default_qdisc') || 'unknown'
  return { current, allowed, qdisc, bbr: allowed.includes('bbr'), source: 'kernel' }
}
export async function setKernelQdisc(qdisc, append) {
  if (!['fq', 'fq_codel', 'fq_pie', 'cake'].includes(qdisc)) throw new Error('队列调度算法无效。')
  await setKernelCongestion('bbr', append)
  await exec('sysctl', ['-w', `net.core.default_qdisc=${qdisc}`], { timeout: 5000 })
  append(`[kernel] 已切换队列调度：${qdisc}`)
  return 0
}
export async function setKernelCongestion(algorithm, append) {
  if (typeof algorithm !== 'string' || !/^[a-z0-9_+-]{1,32}$/.test(algorithm)) throw new Error('拥塞控制名称无效。')
  let allowed = readText('/proc/sys/net/ipv4/tcp_allowed_congestion_control').split(/\s+/).filter(Boolean)
  if (!allowed.includes(algorithm) && ['bbr', 'bbr2'].includes(algorithm)) {
    for (const module of [`tcp_${algorithm}`, algorithm]) {
      try { await exec('modprobe', [module], { timeout: 5000 }) } catch { /* try the next module name */ }
      allowed = readText('/proc/sys/net/ipv4/tcp_allowed_congestion_control').split(/\s+/).filter(Boolean)
      if (allowed.includes(algorithm)) break
    }
  }
  if (!allowed.includes(algorithm)) throw new Error(`内核未提供 ${algorithm}，请先安装对应模块或第三方内核。`)
  await exec('sysctl', ['-w', `net.ipv4.tcp_congestion_control=${algorithm}`], { timeout: 5000 })
  append(`[kernel] 已切换 TCP 拥塞控制：${algorithm}`)
  return 0
}
const BBR_V3_SCRIPT_URL = 'https://raw.githubusercontent.com/byJoey/Actions-bbr-v3/ba71703857be869e9c653e84c184c67e823899bd/install.sh'
async function executePinnedBbrScript(input, label, append) {
  append(`[bbr] 正在下载 ${label}脚本。`)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)
  let response
  try {
    response = await fetch(BBR_V3_SCRIPT_URL, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
  if (!response.ok) throw new Error(`BBR V3 安装脚本下载失败（HTTP ${response.status}）。`)
  const source = await response.text()
  if (!source.includes('select_kernel_profile') || !source.includes('install_latest_version')) throw new Error('下载到的 BBR V3 脚本版本不受支持。')
  const directory = mkdtempSync(join(tmpdir(), 'xray-bbr-v3-'))
  const scriptPath = join(directory, 'install.sh')
  writeFileSync(scriptPath, source, { mode: 0o700 })
  try {
    return await new Promise(resolve => {
      const child = spawn('bash', [scriptPath], {
        shell: false,
        env: { ...process.env, BBRV3_SKIP_QUICK_COMMAND: '1', TERM: 'xterm' },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      child.stdin.end(input)
      for (const output of [child.stdout, child.stderr]) createInterface({ input: output }).on('line', append)
      child.on('error', error => { append(`[bbr] 无法启动安装脚本：${error.message}`); resolve(1) })
      child.on('close', code => resolve(code ?? 1))
    })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
export function executeBbrV3(profile, append) {
  if (!['standard', 'max'].includes(profile)) throw new Error('BBR V3 版本无效。')
  return executePinnedBbrScript(`1\n${profile === 'max' ? '2' : '1'}\n`, `BBR V3 ${profile === 'max' ? 'Max' : '标准版'}安装`, append)
}
export function executeBbrMenu(menu, append) {
  if (!['8', '9', '11', '12', '13', '14'].includes(menu)) throw new Error('BBR 脚本菜单无效。')
  return executePinnedBbrScript(`${menu}\n${menu === '13' ? 'y\n' : ''}`, `BBR 脚本菜单 ${menu} `, append)
}
export function executeBbrSmart(region, rttMs, append) {
  if (!['asia', 'overseas'].includes(region) || !Number.isInteger(rttMs) || rttMs < 1 || rttMs > 5000) throw new Error('智能优化参数无效。')
  return executePinnedBbrScript(`10\n${region === 'overseas' ? '2' : '1'}\n${rttMs}\n`, `BBR V3 智能优化（${rttMs} ms）`, append)
}
export { nodeStats, nodeDefinitions }
