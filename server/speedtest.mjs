const downloadUrl = 'https://speed.cloudflare.com/__down?bytes=5000000'
const uploadUrl = 'https://speed.cloudflare.com/__up'
const timeoutMs = 20_000

async function timed(request) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const start = performance.now()
  try {
    const response = await fetch(request.url, { method: request.method || 'GET', body: request.body, cache: 'no-store', signal: controller.signal })
    if (!response.ok) throw new Error(`测速服务返回 HTTP ${response.status}`)
    const buffer = await response.arrayBuffer()
    const seconds = Math.max(0.001, (performance.now() - start) / 1000)
    return { bytes: request.bytes ?? buffer.byteLength, seconds }
  } finally { clearTimeout(timeout) }
}

export async function runSpeedTest({ demo = false, onProgress = () => {} } = {}) {
  if (demo) return { provider: 'Cloudflare edge（演示）', downloadMbps: 520, uploadMbps: 84, latencyMs: 32, measuredAt: new Date().toISOString() }
  onProgress('正在测量延迟…')
  const latencyStart = performance.now()
  const latencyResponse = await fetch('https://speed.cloudflare.com/__down?bytes=0', { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
  if (!latencyResponse.ok) throw new Error(`测速服务返回 HTTP ${latencyResponse.status}`)
  const latencyMs = Math.round(performance.now() - latencyStart)
  onProgress('正在测量下载速度…')
  const download = await timed({ url: downloadUrl })
  onProgress('正在测量上传速度…')
  const upload = await timed({ url: uploadUrl, method: 'POST', body: Buffer.alloc(1_000_000), bytes: 1_000_000 })
  return { provider: 'Cloudflare edge', downloadMbps: Math.round(download.bytes * 8 / download.seconds / 1_000_000), uploadMbps: Math.round(upload.bytes * 8 / upload.seconds / 1_000_000), latencyMs, measuredAt: new Date().toISOString() }
}
