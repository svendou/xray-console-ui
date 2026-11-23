import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const definitions = [
  { id: 'reality', name: 'REALITY', protocol: 'VLESS / REALITY', service: 'xray', endpoint: settings => `${settings.server || '未配置'}:${settings.public_port}` },
  { id: 'cloudflare', name: 'Cloudflare', protocol: 'VLESS / WebSocket', service: 'cloudflare', endpoint: settings => `${settings.cf_entry}:443` },
  { id: 'hy2', name: 'Hysteria 2', protocol: 'Hysteria 2 / UDP', service: 'hy2', endpoint: settings => `${settings.server || '未配置'}:${settings.hy2_public_port}` },
]

function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return fallback }
}

export function nodeDefinitions() { return definitions }
export function readNodeTests(dataDir) { return existsSync(join(dataDir, 'node-tests.json')) ? readJson(join(dataDir, 'node-tests.json'), {}) : {} }
export function nodeStats({ settings, services, demo, dataDir }) {
  const tests = readNodeTests(dataDir)
  return definitions.map(definition => {
    const service = services.find(item => item.id === definition.service)
    const test = tests[definition.id] || {}
    return {
      id: definition.id, name: definition.name, protocol: definition.protocol, endpoint: definition.endpoint(settings),
      state: service?.state || 'unknown', source: test.source || (demo ? 'demo' : 'not-tested'),
      latencyMs: test.latencyMs ?? null, downloadMbps: test.downloadMbps ?? null, uploadMbps: test.uploadMbps ?? null,
      measuredAt: test.measuredAt || null, trafficDown: null, trafficUp: null, trafficMeasured: false,
    }
  })
}
