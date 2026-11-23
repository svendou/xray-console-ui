import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import http from 'node:http'
import { buildArgs, validHost } from './policy.mjs'
import { Jobs } from './jobs.mjs'
import { createPanel } from './panel.mjs'
import { checkServiceUpdates } from './system.mjs'

const params = { server: '203.0.113.24', realityPort: 43526, publicPort: 43526, hy2Port: 43526, hy2PublicPort: 43526, subscriptionPort: 43518, subscriptionPublicPort: 43518, cfEntry: 'auto', tunnelProtocol: 'http2', hy2: true }
test('fixed argument list rejects command injection, invalid ports and actions', () => {
  assert.deepEqual(buildArgs('restart'), ['restart'])
  assert.ok(buildArgs('install', params).includes('--enable-hy2'))
  for (const server of ['--help', 'x; touch /tmp/pwn', '$(id)', 'https://example.com', '../file', 'good.com\nrm']) assert.equal(validHost(server), false)
  assert.deepEqual(buildArgs('uninstall'), ['uninstall'])
  assert.deepEqual(buildArgs('mtproto-restart'), ['mtproto-restart'])
  assert.deepEqual(buildArgs('set-congestion', { algorithm: 'bbr' }), ['set-congestion', '--algorithm', 'bbr'])
  assert.deepEqual(buildArgs('set-qdisc', { qdisc: 'fq_codel' }), ['set-qdisc', '--qdisc', 'fq_codel'])
  assert.deepEqual(buildArgs('bbr-profile', { profile: 'standard' }), ['bbr-profile', '--profile', 'standard'])
  assert.deepEqual(buildArgs('bbr-profile', { profile: 'max' }), ['bbr-profile', '--profile', 'max'])
  assert.throws(() => buildArgs('bbr-profile', { profile: 'other' }))
  assert.deepEqual(buildArgs('update-xray'), ['update-xray'])
  assert.deepEqual(buildArgs('update-hy2'), ['update-hy2'])
  assert.deepEqual(buildArgs('update-cloudflare'), ['update-cloudflare'])
  assert.deepEqual(buildArgs('status'), ['status'])
  assert.deepEqual(buildArgs('bbr-menu', { menu: '11' }), ['bbr-menu', '--menu', '11'])
  assert.throws(() => buildArgs('bbr-menu', { menu: '10' }))
  assert.deepEqual(buildArgs('mtproto', { mtprotoPort: 53528, mtprotoPublicPort: 53528 }), ['mtproto', '--mtproto-port', '53528', '--mtproto-public-port', '53528'])
  assert.deepEqual(buildArgs('bbr-smart', { region: 'asia', rttMs: 50 }), ['bbr-smart', '--region', 'asia', '--rtt-ms', '50'])
  assert.throws(() => buildArgs('constructor'))
  assert.throws(() => buildArgs('install', { ...params, publicPort: '43526' }))
  assert.throws(() => buildArgs('install', { ...params, realityPort: 48089 }))
  assert.throws(() => buildArgs('install', { ...params, subscriptionPort: 43526 }))
  assert.throws(() => buildArgs('install', { ...params, realityPort: 1023 }))
  assert.throws(() => buildArgs('install', { ...params, publicPort: 43518, subscriptionPublicPort: 43518 }))
  assert.deepEqual(buildArgs('install', { ...params, outputDir: '/srv/vpn-clients' }).slice(-2), ['--output', '/srv/vpn-clients'])
  assert.throws(() => buildArgs('install', { ...params, outputDir: 'relative/path' }))
  assert.throws(() => buildArgs('set-entry', { cfEntry: '-x' }))
  assert.equal(buildArgs('set-entry', { cfEntry: '104.18.42.54' })[2], '104.18.42.54')
})
test('demo service update check returns version-gated actions', async () => {
  const result = await checkServiceUpdates([{ id: 'xray', version: 'v26.11.9' }, { id: 'hy2', version: 'v2.13.0' }], true)
  assert.equal(result.services.xray.latest, 'v26.12.0')
  assert.equal(result.services.xray.available, true)
  assert.equal(result.services.cloudflare.available, true)
  assert.equal(result.services.subscription.available, false)
})
test('external bindings reject loopback Host aliases', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'xray-host-'))
  const panel = createPanel({ password: 'test-password-more-than-16', dataDir: directory, bindHost: '0.0.0.0', origin: 'https://panel.example.com', execute: async () => 0 })
  panel.server.listen(0, '127.0.0.1')
  await once(panel.server, 'listening')
  const base = `http://127.0.0.1:${panel.server.address().port}`
  try {
    const response = await fetch(`${base}/api/session`, { headers: { Host: 'localhost' } })
    assert.equal(response.status, 403)
  } finally {
    panel.closeStreams(); panel.server.closeAllConnections(); await new Promise(resolve => panel.server.close(resolve))
    rmSync(directory, { recursive: true, force: true })
  }
})
test('public HTTP mode accepts the mapped host and origin', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'xray-public-http-'))
  const panel = createPanel({ password: 'test-password-more-than-16', dataDir: directory, bindHost: '0.0.0.0', allowPublicHttp: true, execute: async () => 0 })
  panel.server.listen(0, '127.0.0.1')
  await once(panel.server, 'listening')
  const base = `http://127.0.0.1:${panel.server.address().port}`
  const headers = { Host: '187.7.197.58:58787', Origin: 'http://187.7.197.58:58787', 'Content-Type': 'application/json' }
  try {
    assert.equal((await fetch(`${base}/api/session`, { headers })).status, 200)
    assert.equal((await fetch(`${base}/api/login`, { method: 'POST', headers, body: JSON.stringify({ username: 'admin', password: 'test-password-more-than-16' }) })).status, 200)
  } finally {
    panel.closeStreams(); panel.server.closeAllConnections(); await new Promise(resolve => panel.server.close(resolve))
    rmSync(directory, { recursive: true, force: true })
  }
})
test('demo updates preserve existing install settings', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'xray-demo-update-'))
  const panel = createPanel({ demo: true, dataDir: directory })
  panel.server.listen(0, '127.0.0.1')
  await once(panel.server, 'listening')
  const base = `http://127.0.0.1:${panel.server.address().port}`
  const post = (path, body, cookie = '') => fetch(`${base}${path}`, { method: 'POST', headers: { Origin: 'http://127.0.0.1:8787', Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  try {
    const login = await post('/api/login', { username: 'admin', password: '000000' })
    const cookie = login.headers.get('set-cookie').split(';')[0]
    const before = await (await fetch(`${base}/api/snapshot`, { headers: { Cookie: cookie } })).json()
    assert.equal((await post('/api/jobs', { action: 'update-xray', params: {} }, cookie)).status, 202)
    let after = before
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 100))
      after = await (await fetch(`${base}/api/snapshot`, { headers: { Cookie: cookie } })).json()
      if (after.jobs[0]?.state !== 'running') break
    }
    assert.equal(after.settings.server, before.settings.server)
    assert.equal(after.settings.reality_port, before.settings.reality_port)
    assert.equal(after.settings.subscription_port, before.settings.subscription_port)
  } finally {
    panel.closeStreams(); panel.server.closeAllConnections(); await new Promise(resolve => panel.server.close(resolve))
    rmSync(directory, { recursive: true, force: true })
  }
})
test('jobs prevent concurrent writes, persist output, and mark interrupted work after restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'xray-jobs-'))
  let finish
  const jobs = new Jobs(directory, async (args, append) => { append('service started'); return new Promise(resolve => { finish = resolve }) })
  try {
    const job = jobs.start('restart')
    assert.throws(() => jobs.start('stop'), /已有任务/)
    await new Promise(resolve => setImmediate(resolve))
    const restored = new Jobs(directory, () => 0)
    assert.equal(restored.items[0].state, 'interrupted')
    assert.equal(restored.items[0].logs[0], 'service started')
    finish(0)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(job.state, 'succeeded')
    assert.ok(job.finishedAt)
    assert.equal(new Jobs(directory, () => 0).items[0].state, 'succeeded')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
test('HTTP API enforces login, host and origin checks, emits SSE and revokes sessions', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'xray-api-'))
  const panel = createPanel({ password: 'test-password-more-than-16', dataDir: directory, execute: async () => 0 })
  panel.server.listen(0, '127.0.0.1')
  await once(panel.server, 'listening')
  const base = `http://127.0.0.1:${panel.server.address().port}`
  const post = (path, body, cookie = '', origin = 'http://127.0.0.1:8787') => fetch(`${base}${path}`, { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  try {
    assert.equal((await fetch(`${base}/api/snapshot`)).status, 401)
    for (const path of ['/api/nodes', '/api/logs', '/api/events', '/api/kernel-status', '/api/service-updates']) assert.equal((await fetch(`${base}${path}`)).status, 401)
    const badHostStatus = await new Promise((resolve, reject) => {
      const req = http.get(`${base}/api/session`, { headers: { Host: 'attacker.example' } }, res => { res.resume(); resolve(res.statusCode) })
      req.on('error', reject)
    })
    assert.equal(badHostStatus, 403)
    assert.equal((await post('/api/login', { username: 'admin', password: 'test-password-more-than-16' }, '', 'https://attacker.example')).status, 403)
    assert.equal((await post('/api/login', { username: 'wrong', password: 'wrong' })).status, 401)
    const login = await post('/api/login', { username: 'admin', password: 'test-password-more-than-16' })
    assert.equal(login.status, 200)
    assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/)
    const cookie = login.headers.get('set-cookie').split(';')[0]
    assert.equal((await fetch(`${base}/api/snapshot`, { headers: { Cookie: cookie } })).status, 200)
    assert.equal((await fetch(`${base}/api/ping`, { headers: { Cookie: cookie } })).status, 200)
    const carrier = await (await fetch(`${base}/api/carrier-latency`, { headers: { Cookie: cookie } })).json()
    assert.equal(carrier.results.length, 3)
    const realityCarrier = await (await fetch(`${base}/api/carrier-latency?node=reality`, { headers: { Cookie: cookie } })).json()
    assert.equal(realityCarrier.results.length, 3)
    const snapshot = await (await fetch(`${base}/api/snapshot`, { headers: { Cookie: cookie } })).json()
    assert.equal(snapshot.traffic.source, 'host-interface')
    assert.equal(snapshot.nodeStats.length, 3)
    assert.equal(snapshot.nodeStats[0].state, 'missing')
    assert.ok(snapshot.kernel.current)
    const kernelStatus = await (await fetch(`${base}/api/kernel-status`, { headers: { Cookie: cookie } })).json()
    assert.ok(kernelStatus.current)
    const abort = new AbortController()
    const stream = await fetch(`${base}/api/events`, { headers: { Cookie: cookie }, signal: abort.signal })
    assert.match(stream.headers.get('content-type'), /text\/event-stream/)
    const reader = stream.body.getReader()
    assert.match(new TextDecoder().decode((await reader.read()).value), /^data: /)
    abort.abort()
    assert.equal((await post('/api/jobs', { action: 'install', params: { ...params, server: '$(whoami)' } }, cookie)).status, 400)
    assert.equal((await post('/api/jobs', { action: 'install', params }, cookie)).status, 202)
    assert.equal((await post('/api/logout', {}, cookie)).status, 200)
    assert.equal((await fetch(`${base}/api/nodes`, { headers: { Cookie: cookie } })).status, 401)
  } finally {
    panel.closeStreams(); panel.server.closeAllConnections(); await new Promise(resolve => panel.server.close(resolve))
    await new Promise(resolve => setImmediate(resolve))
    rmSync(directory, { recursive: true, force: true })
  }
})
