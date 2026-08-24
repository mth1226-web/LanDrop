import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DiscoveryStore } from '../src/main/discoveryStore'

test('announceでピアが追加される', () => {
  const store = new DiscoveryStore('self-id')
  const changed = store.handleAnnounce(
    { type: 'announce', deviceId: 'peer-1', deviceName: 'PC-A', httpPort: 12345 },
    '192.168.1.10',
    1000
  )
  assert.equal(changed, true)
  assert.deepEqual(store.getPeers(), [
    { deviceId: 'peer-1', deviceName: 'PC-A', address: '192.168.1.10', httpPort: 12345, lastSeenAt: 1000 }
  ])
})

test('自分自身からのannounceは無視される', () => {
  const store = new DiscoveryStore('self-id')
  const changed = store.handleAnnounce(
    { type: 'announce', deviceId: 'self-id', deviceName: 'me', httpPort: 1 },
    '192.168.1.5',
    1000
  )
  assert.equal(changed, false)
  assert.deepEqual(store.getPeers(), [])
})

test('同じピアからの再announceはlastSeenAtを更新するのみ', () => {
  const store = new DiscoveryStore('self-id')
  store.handleAnnounce({ type: 'announce', deviceId: 'peer-1', deviceName: 'PC-A', httpPort: 111 }, '10.0.0.1', 1000)
  const changed = store.handleAnnounce(
    { type: 'announce', deviceId: 'peer-1', deviceName: 'PC-A', httpPort: 111 },
    '10.0.0.1',
    2000
  )
  assert.equal(changed, false)
  assert.equal(store.getPeer('peer-1')?.lastSeenAt, 2000)
  assert.equal(store.getPeers().length, 1)
})

test('ピアの情報が変化した場合はchanged=trueになる', () => {
  const store = new DiscoveryStore('self-id')
  store.handleAnnounce({ type: 'announce', deviceId: 'peer-1', deviceName: 'PC-A', httpPort: 111 }, '10.0.0.1', 1000)
  const changed = store.handleAnnounce(
    { type: 'announce', deviceId: 'peer-1', deviceName: 'PC-A-renamed', httpPort: 111 },
    '10.0.0.1',
    2000
  )
  assert.equal(changed, true)
})

test('TTLを超えたピアはpruneExpiredで取り除かれる', () => {
  const store = new DiscoveryStore('self-id')
  store.handleAnnounce({ type: 'announce', deviceId: 'peer-1', deviceName: 'PC-A', httpPort: 111 }, '10.0.0.1', 0)
  const expired = store.pruneExpired(20_000, 15_000)
  assert.equal(expired.length, 1)
  assert.equal(expired[0].deviceId, 'peer-1')
  assert.deepEqual(store.getPeers(), [])
})

test('TTL内のピアはpruneExpiredで残る', () => {
  const store = new DiscoveryStore('self-id')
  store.handleAnnounce({ type: 'announce', deviceId: 'peer-1', deviceName: 'PC-A', httpPort: 111 }, '10.0.0.1', 0)
  const expired = store.pruneExpired(10_000, 15_000)
  assert.equal(expired.length, 0)
  assert.equal(store.getPeers().length, 1)
})

test('goodbyeでピアが削除される', () => {
  const store = new DiscoveryStore('self-id')
  store.handleAnnounce({ type: 'announce', deviceId: 'peer-1', deviceName: 'PC-A', httpPort: 111 }, '10.0.0.1', 0)
  const removed = store.handleGoodbye({ type: 'goodbye', deviceId: 'peer-1' })
  assert.equal(removed, true)
  assert.deepEqual(store.getPeers(), [])
})

test('存在しないピアへのgoodbyeはfalseを返す', () => {
  const store = new DiscoveryStore('self-id')
  const removed = store.handleGoodbye({ type: 'goodbye', deviceId: 'unknown' })
  assert.equal(removed, false)
})

test('getPeersはdeviceName順にソートされる', () => {
  const store = new DiscoveryStore('self-id')
  store.handleAnnounce({ type: 'announce', deviceId: 'b', deviceName: 'Zebra', httpPort: 1 }, '10.0.0.1', 0)
  store.handleAnnounce({ type: 'announce', deviceId: 'a', deviceName: 'Apple', httpPort: 2 }, '10.0.0.2', 0)
  assert.deepEqual(
    store.getPeers().map((p) => p.deviceName),
    ['Apple', 'Zebra']
  )
})
