import { ref, computed } from 'vue'
import type { Snapshot, Job, ServerLatency, CarrierLatency } from './types'

export const snapshot = ref<Snapshot>()
export const authenticated = ref(false)
export const loading = ref(true)
export const connected = ref(false)
export const error = ref('')
export const notice = ref('')
export const serverLatency = ref<ServerLatency>()
export const carrierLatency = ref<CarrierLatency[]>([])
export const carrierLatencyByNode = ref<Record<string, CarrierLatency[]>>({})
export const activeJob = computed(() => snapshot.value?.jobs.find(j => j.state === 'running'))
export const healthy = computed(() => snapshot.value?.services.filter(s => s.state === 'running').length ?? 0)
let stream: EventSource | undefined
let toastTimer: ReturnType<typeof setTimeout>

export function toast(message: string) {
  notice.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { notice.value = '' }, 4000)
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } })
  const data = await response.json()
  if (!response.ok) {
    if (response.status === 401) { authenticated.value = false; disconnect() }
    throw new Error(data.error || '请求失败，请重试。')
  }
  return data
}
export function disconnect() { stream?.close(); stream = undefined; connected.value = false }
export function connect() {
  disconnect()
  stream = new EventSource('/api/events')
  stream.onmessage = event => {
    const next = JSON.parse(event.data) as Snapshot
    const previous = snapshot.value
    for (const job of next.jobs) {
      const before = previous?.jobs.find(item => item.id === job.id)
      if (before?.state === 'running' && job.state !== 'running') {
        const message = job.state === 'succeeded'
          ? `${job.label}已完成。`
          : job.state === 'failed'
            ? `${job.label}失败，请查看任务日志。`
            : `${job.label}已中断，请查看任务日志。`
        toast(message)
      }
    }
    snapshot.value = next
    connected.value = true
    error.value = ''
  }
  stream.onerror = () => { connected.value = false; error.value = '实时连接已断开，正在重连。' }
  stream.addEventListener('expired', () => { authenticated.value = false; disconnect() })
}
export async function initialize() {
  try {
    const session = await api<{ authenticated: boolean }>('/session')
    authenticated.value = session.authenticated
    if (session.authenticated) { snapshot.value = await api<Snapshot>('/snapshot'); connect() }
  } catch (e) { error.value = (e as Error).message }
  finally { loading.value = false }
}
export async function run(action: string, params: Record<string, unknown> = {}): Promise<Job | undefined> {
  try {
    const job = await api<Job>('/jobs', { method: 'POST', body: JSON.stringify({ action, params }) })
    if (snapshot.value) snapshot.value.jobs = [job, ...snapshot.value.jobs.filter(j => j.id !== job.id)]
    toast('任务已提交，可在日志中查看进度。')
    return job
  } catch (e) { toast((e as Error).message) }
}
export async function measureServerLatency(): Promise<ServerLatency | undefined> {
  const samples: number[] = []
  let failed = 0
  for (let index = 0; index < 3; index += 1) {
    const started = performance.now()
    try { await api(`/ping?sample=${Date.now()}-${index}`); samples.push(Math.round(performance.now() - started)) }
    catch { failed += 1 }
  }
  const result: ServerLatency = { samples, average: samples.length ? Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length) : null, min: samples.length ? Math.min(...samples) : null, max: samples.length ? Math.max(...samples) : null, failed, measuredAt: new Date().toISOString() }
  serverLatency.value = result
  toast(result.average == null ? '服务器延迟检测失败。' : '服务器延迟检测完成。')
  return result
}
export async function measureCarrierLatency(nodeId = 'server'): Promise<CarrierLatency[]> {
  try {
    const result = await api<{ results: CarrierLatency[] }>(`/carrier-latency?node=${encodeURIComponent(nodeId)}`)
    carrierLatencyByNode.value = { ...carrierLatencyByNode.value, [nodeId]: result.results }
    if (nodeId === 'server') carrierLatency.value = result.results
    toast(result.results.some(item => item.state === 'healthy') ? '三网参考延迟检测完成。' : '暂无可用三网公共探针。')
  } catch (e) { toast((e as Error).message) }
  return carrierLatencyByNode.value[nodeId] || []
}
export const stateLabel = (state: string) => ({ running: '运行中', stopped: '已停止', missing: '未安装', disabled: '未启用', unknown: '未知', succeeded: '已完成', failed: '失败', interrupted: '已中断' })[state] || state
export function bytes(value: number, decimals = 2) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']; const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
  return `${(value / 1024 ** index).toFixed(index > 2 ? 2 : decimals)} ${units[index]}`
}
export function bits(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 Mbps'
  const mbps = value * 8 / 1_000_000
  return `${mbps >= 100 ? Math.round(mbps) : mbps.toFixed(1)} Mbps`
}
export function duration(seconds: number) {
  const days = Math.floor(seconds / 86400), hours = Math.floor(seconds / 3600) % 24, minutes = Math.floor(seconds / 60) % 60
  return days ? `${days} 天 ${hours} 小时` : hours ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`
}
export const time = (date: string) => new Date(date).toLocaleTimeString('zh-CN', { hour12: false })
export async function copy(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      toast('已复制到剪贴板。')
      return
    }
    throw new Error('Clipboard API unavailable')
  } catch {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = value
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      textarea.setSelectionRange(0, value.length)
      const copied = document.execCommand('copy')
      textarea.remove()
      if (copied) {
        toast('已复制到剪贴板。')
        return
      }
    } catch { /* keep the manual-copy message below */ }
    toast('复制失败，请选中文本手动复制。')
  }
}
