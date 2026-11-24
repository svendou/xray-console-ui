import http from 'node:http'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve, extname, sep } from 'node:path'
import os from 'node:os'
import { Jobs } from './jobs.mjs'
import { defaults, readSettings, detectPublicAddress, realServices, servicesFor, checkServiceUpdates, cpuTimes, executeScript, executeBbrV3, executeBbrMenu, executeBbrSmart, nodeExports, serviceLogs, nodeStats, nodeDefinitions, kernelCongestion, setKernelCongestion, setKernelQdisc, restartManagedService } from './system.mjs'
import { TrafficMonitor } from './traffic.mjs'

const carrierProbes = [
  { id: 'mobile', label: '移动参考线路', asn: 9808 },
  { id: 'unicom', label: '联通参考线路', asn: 4837 },
  { id: 'telecom', label: '电信参考线路', asn: 4134 },
]

async function globalpingCarrier(target, probe) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 7000)
  try {
    const response = await fetch('https://api.globalping.io/v1/measurements', {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ target, type: 'ping', locations: [{ asn: probe.asn }] }),
    })
    if (!response.ok) return null
    const created = await response.json()
    if (!created?.id) return null
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 500))
      const result = await fetch(`https://api.globalping.io/v1/measurements/${encodeURIComponent(created.id)}`, { signal: controller.signal })
      if (!result.ok) continue
      const value = await result.json()
      if (value.status === 'finished' || value.status === 'failed') {
        const measurements = value.results || value.measurements || []
        const latency = measurements.flatMap(item => {
          const result = item?.result || {}
          const stats = result.stats || {}
          const timings = Array.isArray(result.timings) ? result.timings.map(timing => timing?.rtt) : []
          const responses = result.responses || result.measurements || []
          return [stats.avg, stats.min, ...timings, ...responses.map(response => response?.average ?? response?.avg ?? response?.latency ?? response?.rtt)]
        }).map(item => Number(item)).find(item => Number.isFinite(item) && item > 0)
        return latency ? Math.round(latency) : null
      }
    }
  } catch { return null } finally { clearTimeout(timeout) }
  return null
}

async function carrierLatency({ demo, target, nodeId = 'server' }) {
  if (demo) {
    const offset = nodeId === 'cloudflare' ? 6 : nodeId === 'hy2' ? 11 : 0
    return carrierProbes.map((probe, index) => ({ id: probe.id, label: probe.label, state: 'healthy', latencyMs: [38, 52, 46][index] + offset, measuredAt: new Date().toISOString(), source: 'demo' }))
  }
  if (!target) return carrierProbes.map(probe => ({ id: probe.id, label: probe.label, state: 'unconfigured', latencyMs: null, measuredAt: null, source: '未配置服务器地址' }))
  return Promise.all(carrierProbes.map(async probe => {
    const latency = await globalpingCarrier(target, probe)
    return { id: probe.id, label: probe.label, state: latency == null ? 'unconfigured' : 'healthy', latencyMs: latency, measuredAt: latency == null ? null : new Date().toISOString(), source: latency == null ? '暂无可用公共探针' : 'Globalping ASN 参考探针' }
  }))
}

export function createPanel({ demo = false, username = 'admin', password = '', dataDir, script, origin = '', devOrigin = '', dist = resolve('dist'), execute, bindHost = '127.0.0.1', allowPublicHttp = false } = {}) {
  if (demo) password ||= '000000'
  if (!demo && (typeof password !== 'string' || password.length < 5)) throw new Error('请设置至少 5 个字符的 PANEL_PASSWORD。')
  const salt = randomBytes(16)
  const passwordHash = scryptSync(password, salt, 64)
  const sessions = new Map(), failures = new Map(), clients = new Map()
  const loopbackHosts = ['localhost', '127.0.0.1', '[::1]']
  const externalHost = !['localhost', '127.0.0.1', '::1'].includes(bindHost)
  const allowedHosts = new Set(externalHost && origin ? [new URL(origin).hostname] : loopbackHosts)
  const acceptedOrigins = new Set([...(externalHost ? [] : ['http://127.0.0.1:8787', 'http://localhost:8787']), ...[origin, devOrigin].filter(Boolean)])
  let current, kernelStatus, history = [], previousCpu = cpuTimes(), collecting = false
  let demoSettings = { ...defaults, server: '203.0.113.24' }
  let demoStates = { xray: 'running', cloudflare: 'running', hy2: 'running', subscription: 'running', mtproto: 'missing' }
  let demoCongestion = 'bbr'
  let demoQdisc = 'fq'
  const carrierCache = new Map()
  let demoStep = 0
  const traffic = new TrafficMonitor(dataDir, demo)
  const demoExecute = async (args, append) => {
    append('[演示模式] 以下为模拟执行，不会修改当前电脑或服务器。')
    const lines = args[0] === 'bbr-profile'
      ? ['连接 BBR V3 发布仓库…', '选择菜单 1：安装或更新最新版 BBR V3…', `选择${args[2] === 'max' ? ' BBR V3 Max 激进吞吐版' : ' BBR V3 标准版'}…`, '下载并校验内核安装包…', '更新引导配置，重启后切换新内核。']
      : args[0] === 'install'
      ? ['检查系统与依赖…', '检查端口与现有配置…', '下载并校验 Xray、cloudflared、Hysteria2…', '生成配置并保留现有账号密钥…', '启动核心与订阅服务…', '等待 Cloudflare 隧道就绪…', '监听检查通过，导出节点与订阅。']
      : ['检查已安装的配置…', '执行服务操作…', '更新服务状态…']
    for (const line of lines) { await new Promise(r => setTimeout(r, 650)); append(`[vpn] ${line}`) }
    if (args[0] === 'stop') for (const key of Object.keys(demoStates)) if (demoStates[key] === 'running') demoStates[key] = 'stopped'
    if (['start', 'restart', 'install'].includes(args[0])) for (const key of Object.keys(demoStates)) if (demoStates[key] !== 'missing' && (key !== 'hy2' || demoSettings.hy2_enabled)) demoStates[key] = 'running'
    if (args[0] === 'bbr-profile') demoCongestion = 'bbr'
    if (args[0] === 'mtproto') demoStates.mtproto = 'running'
    if (args[0] === 'set-congestion') demoCongestion = args[2]
    if (args[0] === 'set-qdisc') demoQdisc = args[2]
    if (args[0] === 'set-entry') demoSettings.cf_entry = args[2]
    if (args[0] === 'install') {
      const value = flag => args[args.indexOf(flag) + 1]
      demoSettings = { ...demoSettings, server: value('--server') ?? demoSettings.server, reality_port: Number(value('--reality-port') ?? demoSettings.reality_port), public_port: Number(value('--public-port') ?? demoSettings.public_port), hy2_port: Number(value('--hy2-port') ?? demoSettings.hy2_port), hy2_public_port: Number(value('--hy2-public-port') ?? demoSettings.hy2_public_port), subscription_port: Number(value('--subscription-port') ?? demoSettings.subscription_port), subscription_public_port: Number(value('--subscription-public-port') ?? demoSettings.subscription_public_port), cf_entry: value('--cf-entry') ?? demoSettings.cf_entry, tunnel_protocol: value('--tunnel-protocol') ?? demoSettings.tunnel_protocol, hy2_enabled: args.includes('--enable-hy2') || (!args.includes('--enable-hy2') && !args.includes('--disable-hy2') && demoSettings.hy2_enabled) }
      demoStates.hy2 = demoSettings.hy2_enabled ? 'running' : 'disabled'
    }
    return 0
  }
  const scriptExecute = execute ?? (demo ? demoExecute : executeScript(script))
  const actionExecute = async (args, append) => {
    if (args[0] === 'update-xray') return scriptExecute(['install', '--xray-version', 'latest'], append)
    if (args[0] === 'update-hy2') return scriptExecute(['install', '--hy2-version', 'latest'], append)
    if (args[0] === 'update-cloudflare') return scriptExecute(['install', '--cloudflared-version', 'latest'], append)
    if (args[0] === 'bbr-profile') {
      if (demo || execute) return scriptExecute(args, append)
      return executeBbrV3(args[2], append)
    }
    if (args[0] === 'bbr-menu') {
      if (demo || execute) return scriptExecute(args, append)
      return executeBbrMenu(args[2], append)
    }
    if (args[0] === 'bbr-smart') {
      if (demo || execute) return scriptExecute(args, append)
      return executeBbrSmart(args[2], Number(args[4]), append)
    }
    if (args[0] === 'xray-restart' || args[0] === 'hy2-restart') return restartManagedService(args[0].replace('-restart', ''), append)
    if (args[0] === 'set-congestion') {
      if (demo) { append(`[演示模式] 已模拟切换 TCP 拥塞控制：${args[2]}`); demoCongestion = args[2]; return 0 }
      return setKernelCongestion(args[2], append)
    }
    if (args[0] === 'set-qdisc') {
      if (demo) { append(`[演示模式] 已模拟切换 BBR 与队列调度：bbr + ${args[2]}`); demoCongestion = 'bbr'; demoQdisc = args[2]; return 0 }
      return setKernelQdisc(args[2], append)
    }
    return scriptExecute(args, append)
  }
  const jobs = new Jobs(dataDir, actionExecute, broadcast)
  if (demo && !jobs.items.length) {
    jobs.items.push({ id: 'demo-initial', action: 'install', label: '首次安装节点（演示）', state: 'succeeded', startedAt: new Date(Date.now() - 600000).toISOString(), finishedAt: new Date(Date.now() - 540000).toISOString(), logs: ['[演示模式] 服务器环境检查通过。', '[vpn] Xray、Hy2、Cloudflare 隧道与订阅服务已启动。', '[vpn] 本机监听检查通过，客户端外网连接请实测。'], exitCode: 0 })
    jobs.save()
  }
  const sessionFor = request => {
    const cookie = request.headers.cookie?.match(/(?:^|;\s*)xray_console_session=([a-f0-9]{64})(?:;|$)/)?.[1]
    const expires = sessions.get(cookie)
    if (expires && expires > Date.now()) return cookie
    sessions.delete(cookie)
    return null
  }
  function broadcast() {
    if (!current) return
    const payload = JSON.stringify({ ...current, jobs: jobs.items })
    for (const [client, token] of clients) {
      if (!sessions.has(token) || sessions.get(token) <= Date.now()) { client.write('event: expired\ndata: {}\n\n'); client.end(); clients.delete(client); continue }
      // Drop slow clients instead of buffering unbounded task output.
      if (!client.write(`data: ${payload}\n\n`)) { client.end(); clients.delete(client) }
    }
  }
  async function collect() {
    if (collecting) return
    collecting = true
    try {
      const settings = demo ? demoSettings : readSettings()
      const now = new Date().toISOString(), next = cpuTimes()
      const delta = next.total - previousCpu.total
      const cpu = demo ? Math.round(12 + 8 * Math.sin(++demoStep / 4)) : delta > 0 ? Math.max(0, Math.round((1 - (next.idle - previousCpu.idle) / delta) * 100)) : 0
      previousCpu = next
      const memory = demo ? 38 : Math.round((1 - os.freemem() / os.totalmem()) * 100)
      if (demo && !history.length) history = Array.from({ length: 24 }, (_, i) => ({ time: new Date(Date.now() - (24 - i) * 3000).toISOString(), cpu: Math.round(12 + 7 * Math.sin(i / 2)), memory: 37 + Math.round(Math.sin(i / 3)) }))
      history = [...history, { time: now, cpu, memory }].slice(-60)
      if (!kernelStatus) kernelStatus = demo ? { current: demoCongestion, allowed: ['cubic', 'bbr', 'bbr2'], qdisc: demoQdisc, bbr: true, qdiscSupported: true, bbrV3Supported: true, bbrV3Installed: true, bbrV3StandardInstalled: true, bbrV3MaxInstalled: false, bbrV3Profile: 'standard', bbrV3Active: true, bbrV3ActiveProfile: 'standard', smartOptimization: true, apacTuning: false, crazyMode: false, ipv6Disabled: false, distro: 'demo', source: 'demo' } : await kernelCongestion()
      current = {
        demo, installed: demo || existsSync('/etc/personal-vpn-stack/managed-by'), updatedAt: now,
        hostname: demo ? 'xray-console-ui-server' : os.hostname(), platform: demo ? 'Ubuntu 24.04 LTS' : `${os.type()} ${os.release()} · ${os.arch()}`,
        publicAddress: await detectPublicAddress(demo),
        uptime: demo ? 86400 * 12 + 3600 * 6 : os.uptime(), cpu, memory,
        totalMemory: demo ? 2 * 1024 ** 3 : os.totalmem(), cores: demo ? 2 : os.cpus().length,
        settings, services: demo ? servicesFor({ ...settings, xray_version: 'v26.11.9', cloudflared_version: '2026.10.1', hy2_version: 'v2.13.0' }, demoStates, demoStates.mtproto === 'missing' ? null : { port: 53528 }) : await realServices(settings),
        jobs: jobs.items, history, traffic: traffic.sample(),
        kernel: kernelStatus,
      }
      current.nodeStats = nodeStats({ settings, services: current.services, demo, dataDir, traffic: current.traffic })
      broadcast()
    } finally { collecting = false }
  }
  const ready = collect()
  const interval = setInterval(() => {
    for (const [key, value] of sessions) if (value < Date.now()) sessions.delete(key)
    for (const [key, value] of failures) if (value.until < Date.now()) failures.delete(key)
    collect().catch(e => console.error('状态采集失败:', e.message))
  }, 3000)
  interval.unref()
  function json(response, code, value) { response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)) }
  async function body(request) {
    let value = ''
    for await (const chunk of request) { value += chunk; if (Buffer.byteLength(value) > 8192) throw Object.assign(new Error('请求体过大。'), { status: 413 }) }
    try { return JSON.parse(value) } catch { throw Object.assign(new Error('请求必须是 JSON。'), { status: 400 }) }
  }
  const server = http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('X-Frame-Options', 'DENY')
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
    response.setHeader('Cache-Control', 'no-store')
    try {
      const host = new URL(`http://${request.headers.host || ''}`).hostname
      if (!allowedHosts.has(host) && !(externalHost && allowPublicHttp)) return json(response, 403, { error: '未授权的访问域名，请配置 PANEL_ORIGIN。' })
      const path = new URL(request.url, 'http://localhost').pathname
      if (path.startsWith('/api/')) {
        if (!['GET', 'POST'].includes(request.method)) return json(response, 405, { error: '请求方法不支持。' })
        const publicHttpOrigin = allowPublicHttp && externalHost && request.headers.origin?.startsWith('http://')
        if (request.method === 'POST' && !acceptedOrigins.has(request.headers.origin) && !publicHttpOrigin) return json(response, 403, { error: '请求来源不匹配。' })
        if (path === '/api/session' && request.method === 'GET') return json(response, 200, { authenticated: Boolean(sessionFor(request)), demo })
        if (path === '/api/login' && request.method === 'POST') {
          const key = request.socket.remoteAddress
          const fail = failures.get(key), global = failures.get('*')
          if ((fail && fail.count >= 5 && fail.until > Date.now()) || (global && global.count >= 60 && global.until > Date.now())) return json(response, 429, { error: '登录尝试过多，请一分钟后再试。' })
          const data = await body(request)
          if (typeof data.username !== 'string' || data.username.length > 64 || typeof data.password !== 'string' || data.password.length > 1024) return json(response, 400, { error: '账号或密码格式错误。' })
          const usernameOk = data.username.length === username.length && timingSafeEqual(Buffer.from(data.username), Buffer.from(username))
          const passwordOk = timingSafeEqual(scryptSync(data.password, salt, 64), passwordHash)
          if (!usernameOk || !passwordOk) {
            for (const id of [key, '*']) { const previous = failures.get(id); failures.set(id, { count: previous && previous.until > Date.now() ? previous.count + 1 : 1, until: Date.now() + 60000 }) }
            return json(response, 401, { error: '管理密码不正确。' })
          }
          failures.delete(key)
          if (sessions.size >= 20) sessions.delete(sessions.keys().next().value)
          const token = randomBytes(32).toString('hex')
          sessions.set(token, Date.now() + 8 * 3600000)
          response.setHeader('Set-Cookie', `xray_console_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${origin.startsWith('https:') ? '; Secure' : ''}`)
          return json(response, 200, { ok: true })
        }
        const token = sessionFor(request)
        if (!token) return json(response, 401, { error: '请先登录管理台。' })
        if (path === '/api/logout' && request.method === 'POST') { sessions.delete(token); response.setHeader('Set-Cookie', 'xray_console_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); broadcast(); return json(response, 200, { ok: true }) }
        await ready
        if (path === '/api/snapshot' && request.method === 'GET') return json(response, 200, { ...current, jobs: jobs.items })
        if (path === '/api/kernel-status' && request.method === 'GET') {
          kernelStatus = demo ? { current: demoCongestion, allowed: ['cubic', 'bbr', 'bbr2'], qdisc: demoQdisc, bbr: true, qdiscSupported: true, bbrV3Supported: true, bbrV3Installed: true, bbrV3StandardInstalled: true, bbrV3MaxInstalled: false, bbrV3Profile: 'standard', bbrV3Active: true, bbrV3ActiveProfile: 'standard', smartOptimization: true, apacTuning: false, crazyMode: false, ipv6Disabled: false, distro: 'demo', source: 'demo' } : await kernelCongestion()
          if (current) { current.kernel = kernelStatus; broadcast() }
          return json(response, 200, kernelStatus)
        }
        if (path === '/api/service-updates' && request.method === 'GET') return json(response, 200, await checkServiceUpdates(current.services, demo))
        if (path === '/api/ping' && request.method === 'GET') return json(response, 200, { ok: true, serverTime: new Date().toISOString() })
        if (path === '/api/carrier-latency' && request.method === 'GET') {
          const requestUrl = new URL(request.url, 'http://localhost')
          const nodeId = requestUrl.searchParams.get('node') || 'server'
          if (!['server', ...nodeDefinitions().map(item => item.id)].includes(nodeId)) return json(response, 400, { error: '节点标识无效。' })
          const cached = carrierCache.get(nodeId)
          if (!cached || Date.now() - cached.at > 30000) {
            const settings = current?.settings || demoSettings
            const definition = nodeDefinitions().find(item => item.id === nodeId)
            const endpoint = definition ? definition.endpoint(settings) : settings.server
            const target = endpoint.includes('未配置') ? '' : endpoint.replace(/:\d+$/, '')
            carrierCache.set(nodeId, { at: Date.now(), value: await carrierLatency({ demo, target, nodeId }) })
          }
          return json(response, 200, { results: carrierCache.get(nodeId).value })
        }
        if (path === '/api/events' && request.method === 'GET') {
          if (clients.size >= 20) return json(response, 429, { error: '实时连接数已达上限。' })
          response.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
          clients.set(response, token)
          response.on('close', () => clients.delete(response))
          broadcast()
          return
        }
        if (path === '/api/jobs' && request.method === 'POST') {
          const { action, params } = await body(request)
          if (!demo && !['install', 'bbr-profile'].includes(action) && !current.installed) return json(response, 400, { error: '请先完成节点安装。' })
          const job = jobs.start(action, params)
          return json(response, 202, job)
        }
        if (path === '/api/nodes' && request.method === 'GET') return json(response, 200, nodeExports(demo))
        if (path === '/api/logs' && request.method === 'GET') return json(response, 200, { lines: demo ? ['[演示模式] 以下日志为示例。', '[xray] Xray 26.11.9 started', '[cloudflare] Registered tunnel connection protocol=http2', '[hy2] server up and running', '[subscription] Subscription listener ready on TCP 43518'] : await serviceLogs() })
        return json(response, 404, { error: '接口不存在。' })
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') return json(response, 405, { error: '请求方法不支持。' })
      const file = resolve(dist, `.${decodeURIComponent(path === '/' ? '/index.html' : path)}`)
      if (!file.startsWith(`${resolve(dist)}${sep}`)) return json(response, 404, { error: '文件不存在。' })
      if (!existsSync(file)) return json(response, 404, { error: '页面不存在。请先运行 npm run build。' })
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' }
      const data = readFileSync(file)
      response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' })
      response.end(request.method === 'HEAD' ? undefined : data)
    } catch (error) {
      console.error(error.message)
      if (!response.headersSent) json(response, error.status || (error.code ? 500 : 400), { error: error.code ? '服务器读取失败，请查看后台日志。' : error.message })
      else response.end()
    }
  })
  server.on('close', () => { clearInterval(interval); for (const client of clients.keys()) client.end() })
  return { server, jobs, ready, stopJobs: () => scriptExecute.stop?.(), closeStreams: () => { for (const client of clients.keys()) client.end() } }
}
