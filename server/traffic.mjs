import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync } from 'node:fs'
import { join } from 'node:path'

const DAY = 86_400_000
const clean = value => Math.max(0, Number.isFinite(value) ? value : 0)

export function parseNetDev(text, selected = '') {
  const result = {}
  for (const line of text.split('\n').slice(2)) {
    const match = line.match(/^\s*([^:]+):\s*(.*)$/)
    if (!match) continue
    const fields = match[2].trim().split(/\s+/)
    if (fields.length < 9) continue
    const name = match[1].trim()
    if (name === 'lo' || (selected && name !== selected)) continue
    result[name] = { rx: clean(Number(fields[0])), tx: clean(Number(fields[8])) }
  }
  return result
}

export function chooseInterface(routeText, counters) {
  const route = routeText.split('\n').map(line => line.trim().split(/\s+/)).find(parts => parts[1] === '00000000')
  if (route?.[0] && counters[route[0]]) return route[0]
  return Object.keys(counters).sort()[0] || ''
}

export class TrafficMonitor {
  constructor(dataDir, demo = false) {
    this.demo = demo
    this.file = join(dataDir, 'traffic.json')
    mkdirSync(dataDir, { recursive: true, mode: 0o700 })
    chmodSync(dataDir, 0o700)
    try { this.state = JSON.parse(readFileSync(this.file, 'utf8')) } catch { this.state = {} }
    this.lastAt = Number(this.state.lastAt) || 0
    this.last = { rx: Number(this.state.lastRx) || 0, tx: Number(this.state.lastTx) || 0 }
    this.demoStep = 0
  }

  persist() {
    const value = { ...this.state, lastAt: this.lastAt, lastRx: this.last.rx, lastTx: this.last.tx }
    writeFileSync(`${this.file}.tmp`, JSON.stringify(value), { mode: 0o600 })
    renameSync(`${this.file}.tmp`, this.file)
  }

  sample() {
    const now = Date.now()
    if (this.demo) return this.sampleDemo(now)
    if (!existsSync('/proc/net/dev')) return this.commit(now, 'unknown', 0, 0, 'host-interface')
    const text = readFileSync('/proc/net/dev', 'utf8')
    const counters = parseNetDev(text, process.env.PANEL_NET_INTERFACE || '')
    const route = existsSync('/proc/net/route') ? readFileSync('/proc/net/route', 'utf8') : ''
    const interfaceName = process.env.PANEL_NET_INTERFACE || chooseInterface(route, counters)
    const current = counters[interfaceName] || { rx: 0, tx: 0 }
    return this.commit(now, interfaceName, current.rx, current.tx, 'host-interface')
  }

  commit(now, interfaceName, rx, tx, source) {
    const interval = this.lastAt ? Math.max(0.25, (now - this.lastAt) / 1000) : 0
    const downRate = interval ? Math.max(0, (rx - this.last.rx) / interval) : 0
    const upRate = interval ? Math.max(0, (tx - this.last.tx) / interval) : 0
    const date = new Date(now).toLocaleDateString('sv-SE')
    const totalRx = clean(this.state.totalRx), totalTx = clean(this.state.totalTx)
    if (this.state.date !== date) this.state = { ...this.state, date, todayRx: 0, todayTx: 0, peakDown: 0, peakUp: 0, history: [] }
    this.state.date ||= date
    const deltaRx = this.lastAt ? Math.max(0, rx - this.last.rx) : 0
    const deltaTx = this.lastAt ? Math.max(0, tx - this.last.tx) : 0
    this.state.todayRx = clean(this.state.todayRx) + deltaRx
    this.state.todayTx = clean(this.state.todayTx) + deltaTx
    this.state.totalRx = totalRx + deltaRx
    this.state.totalTx = totalTx + deltaTx
    this.state.peakDown = Math.max(clean(this.state.peakDown), downRate)
    this.state.peakUp = Math.max(clean(this.state.peakUp), upRate)
    this.state.history = [...(this.state.history || []), { time: new Date(now).toISOString(), down: Math.round(downRate), up: Math.round(upRate) }].slice(-60)
    this.lastAt = now; this.last = { rx, tx }; this.persist()
    return { interface: interfaceName || 'unknown', source, measuredAt: new Date(now).toISOString(), todayRx: this.state.todayRx, todayTx: this.state.todayTx, totalRx: this.state.totalRx, totalTx: this.state.totalTx, quotaBytes: Number(process.env.PANEL_TRAFFIC_QUOTA_BYTES) || 1024 ** 4, downRate, upRate, peakDown: this.state.peakDown, peakUp: this.state.peakUp, history: this.state.history }
  }

  sampleDemo(now) {
    const downRate = 30_000 + Math.round(13_000 * Math.sin(++this.demoStep / 3))
    const upRate = 30_000 + Math.round(8_000 * Math.cos(this.demoStep / 4))
    const todayRx = 8.12 * 1024 ** 3 + this.demoStep * downRate * 3
    const todayTx = 8.29 * 1024 ** 3 + this.demoStep * upRate * 3
    return { interface: 'eth0', source: 'demo', measuredAt: new Date(now).toISOString(), todayRx, todayTx, totalRx: 420 * 1024 ** 3 + this.demoStep * downRate, totalTx: 196 * 1024 ** 3 + this.demoStep * upRate, quotaBytes: 1024 ** 4, downRate, upRate, peakDown: 98_000, peakUp: 71_000, history: Array.from({ length: 30 }, (_, i) => ({ time: new Date(now - (30 - i) * 3000).toISOString(), down: 22_000 + Math.round(10_000 * Math.sin((i + this.demoStep) / 3)), up: 21_000 + Math.round(8_000 * Math.cos(i / 4)) })) }
  }
}
