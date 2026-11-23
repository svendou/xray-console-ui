import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseNetDev, chooseInterface, TrafficMonitor } from './traffic.mjs'

const sample = `Inter-|   Receive                                                |  Transmit\n face |bytes packets errs drop fifo frame compressed multicast|bytes packets errs drop fifo colls carrier compressed\n  lo: 100 0 0 0 0 0 0 0 200 0 0 0 0 0 0 0\n eth0: 1200 1 0 0 0 0 0 0 3400 2 0 0 0 0 0 0\n eth1: 99 1 0 0 0 0 0 0 100 2 0 0 0 0 0 0`

test('reads receive/transmit bytes and ignores loopback', () => {
  const counters = parseNetDev(sample)
  assert.deepEqual(counters, { eth0: { rx: 1200, tx: 3400 }, eth1: { rx: 99, tx: 100 } })
  assert.deepEqual(parseNetDev(sample, 'eth1'), { eth1: { rx: 99, tx: 100 } })
  assert.equal(chooseInterface('Iface\tDestination\neth0\t00000000\n', counters), 'eth0')
})

test('persists daily totals and computes rates from counter deltas', () => {
  const directory = mkdtempSync(join(tmpdir(), 'xray-traffic-'))
  try {
    const monitor = new TrafficMonitor(directory)
    const first = monitor.commit(1_700_000_000_000, 'eth0', 1_000, 2_000, 'host-interface')
    const second = monitor.commit(1_700_000_003_000, 'eth0', 4_000, 5_000, 'host-interface')
    assert.equal(first.downRate, 0)
    assert.equal(second.downRate, 1_000)
    assert.equal(second.upRate, 1_000)
    assert.equal(second.todayRx, 3_000)
    assert.equal(JSON.parse(readFileSync(join(directory, 'traffic.json'))).todayTx, 3_000)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
