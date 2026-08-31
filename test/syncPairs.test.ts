import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadSyncPairStore, saveSyncPairStore, listSyncPairs, upsertSyncPair, deleteSyncPair } from '../src/main/syncPairs'
import type { SyncPairStore } from '../src/main/syncPairs'
import type { SyncPair } from '../src/shared/types'

function makePair(overrides: Partial<SyncPair> = {}): SyncPair {
  return {
    id: 'pair-1',
    name: 'テストペア',
    localFolder: 'C:/local',
    remotePeerDeviceId: 'peer-1',
    remoteFolder: 'Shared',
    mode: 'mirror',
    direction: 'push',
    compareBy: 'time-size',
    useVersioning: false,
    ...overrides
  }
}

test('loadSyncPairStoreはファイルが無ければ空オブジェクトを返す', () => {
  const filePath = path.join(os.tmpdir(), `landrop-sync-pairs-missing-${Date.now()}.json`)
  assert.deepEqual(loadSyncPairStore(filePath), {})
})

test('壊れたJSONの場合は空オブジェクトを返す', () => {
  const filePath = path.join(os.tmpdir(), `landrop-sync-pairs-broken-${Date.now()}.json`)
  fs.writeFileSync(filePath, 'not json', 'utf-8')
  assert.deepEqual(loadSyncPairStore(filePath), {})
  fs.rmSync(filePath, { force: true })
})

test('保存した内容をそのまま読み込める', () => {
  const filePath = path.join(os.tmpdir(), `landrop-sync-pairs-${Date.now()}.json`)
  const store: SyncPairStore = { 'pair-1': makePair() }
  saveSyncPairStore(filePath, store)
  assert.deepEqual(loadSyncPairStore(filePath), store)
  fs.rmSync(filePath, { force: true })
})

test('upsertSyncPairで新規追加・既存更新の両方ができる', () => {
  let store: SyncPairStore = {}
  store = upsertSyncPair(store, makePair())
  assert.equal(listSyncPairs(store).length, 1)
  store = upsertSyncPair(store, makePair({ name: '更新後の名前' }))
  assert.equal(listSyncPairs(store).length, 1)
  assert.equal(listSyncPairs(store)[0].name, '更新後の名前')
})

test('listSyncPairsは名前順で返す', () => {
  let store: SyncPairStore = {}
  store = upsertSyncPair(store, makePair({ id: 'a', name: 'B' }))
  store = upsertSyncPair(store, makePair({ id: 'b', name: 'A' }))
  assert.deepEqual(
    listSyncPairs(store).map((p) => p.name),
    ['A', 'B']
  )
})

test('deleteSyncPairで指定idだけ削除される', () => {
  let store: SyncPairStore = {}
  store = upsertSyncPair(store, makePair({ id: 'a' }))
  store = upsertSyncPair(store, makePair({ id: 'b' }))
  store = deleteSyncPair(store, 'a')
  assert.deepEqual(
    listSyncPairs(store).map((p) => p.id),
    ['b']
  )
})
