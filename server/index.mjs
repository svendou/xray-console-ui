import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { createPanel } from './panel.mjs'

process.umask(0o077)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const demo = process.argv.includes('--demo')
const host = process.env.PANEL_HOST || '127.0.0.1'
const port = Number(process.env.PANEL_PORT || 8787)
const allowPublicHttp = process.env.PANEL_ALLOW_INSECURE_HTTP === '1'
const origin = process.env.PANEL_ORIGIN || ''
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PANEL_PORT 无效。')
if (demo && !['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('演示模式只能绑定本机回环地址。')
if (!demo && (process.platform !== 'linux' || process.getuid?.() !== 0)) throw new Error('真实管理需要在 Linux 上以 root 运行；本地体验请使用 npm run dev。')
if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !origin.startsWith('https://') && !(allowPublicHttp && (!origin || origin.startsWith('http://')))) throw new Error('对外监听需要 HTTPS 的 PANEL_ORIGIN，或显式启用 PANEL_ALLOW_INSECURE_HTTP=1。')
const script = resolve(root, 'scripts/deploy-personal-vpn.sh')
if (!existsSync(script)) throw new Error('缺少 scripts/deploy-personal-vpn.sh。')
const panel = createPanel({
  demo, username: process.env.PANEL_USERNAME || 'admin', password: process.env.PANEL_PASSWORD_FILE ? readFileSync(process.env.PANEL_PASSWORD_FILE, 'utf8').replace(/\r?\n$/, '') : process.env.PANEL_PASSWORD,
  dataDir: process.env.PANEL_DATA_DIR || resolve(root, '.panel-data', demo ? 'demo' : 'live'),
  script, origin, devOrigin: process.env.DEV_FRONTEND_ORIGIN, dist: resolve(root, 'dist'), allowPublicHttp,
  bindHost: host,
})
await panel.ready
panel.server.listen(port, host, () => console.log(`Xray Console UI ${demo ? '[演示模式]' : '[真实管理]'} http://${host}:${port}`))
// Running tasks finish before a normal service restart; systemd also keeps the process group together.
async function shutdown() {
  panel.closeStreams()
  panel.server.close()
  panel.stopJobs?.()
  const deadline = Date.now() + 10000
  while (panel.jobs.items.some(j => j.state === 'running') && Date.now() < deadline) await new Promise(r => setTimeout(r, 250))
  process.exit()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
