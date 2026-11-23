import { spawn } from 'node:child_process'
import { createServer } from 'vite'

const api = spawn(process.execPath, ['server/index.mjs', ...(process.argv.includes('--live') ? [] : ['--demo'])], {
  stdio: 'inherit', env: { ...process.env, DEV_FRONTEND_ORIGIN: 'http://127.0.0.1:5173' },
})
const vite = await createServer()
await vite.listen()
vite.printUrls()
async function close() { api.kill(); await vite.close(); process.exit() }
process.on('SIGINT', close)
process.on('SIGTERM', close)
api.on('exit', code => { if (code) close() })
