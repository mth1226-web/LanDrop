import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computePlan } from '../src/main/syncEngine'
import type { SyncManifest, SyncManifestEntry, SyncPair } from '../src/shared/types'

function entry(overrides: Partial<SyncManifestEntry>): SyncManifestEntry {
  return { relPath: 'a.txt', isDirectory: false, size: 10, modifiedAt: 1_000_000, ...overrides }
}

function manifest(entries: SyncManifestEntry[]): SyncManifest {
  return { rootKey: 'test', generatedAt: Date.now(), entries }
}

const pair: SyncPair = {
  id: 'pair-1',
  name: 'テスト',
  localFolder: 'C:/local',
  remotePeerDeviceId: 'peer-1',
  remoteFolder: 'Shared',
  mode: 'mirror',
  direction: 'push',
  compareBy: 'time-size',
  useVersioning: false
}

test('ソースにのみ存在するファイルはcreateになる', () => {
  const plan = computePlan(manifest([entry({ relPath: 'new.txt' })]), manifest([]), pair)
  assert.equal(plan.items.length, 1)
  assert.equal(plan.items[0].action, 'create')
  assert.equal(plan.summary.creates, 1)
})

test('ターゲットにのみ存在するファイルはdeleteになる', () => {
  const plan = computePlan(manifest([]), manifest([entry({ relPath: 'old.txt' })]), pair)
  assert.equal(plan.items.length, 1)
  assert.equal(plan.items[0].action, 'delete')
  assert.equal(plan.summary.deletes, 1)
})

test('サイズが異なる場合はupdateになる', () => {
  const plan = computePlan(
    manifest([entry({ size: 20, modifiedAt: 1_000_000 })]),
    manifest([entry({ size: 10, modifiedAt: 1_000_000 })]),
    pair
  )
  assert.equal(plan.items[0].action, 'update')
  assert.equal(plan.items[0].reason, 'サイズが異なる')
})

test('ソースのmtimeが2秒より新しい場合はupdateになる', () => {
  const plan = computePlan(
    manifest([entry({ size: 10, modifiedAt: 1_010_000 })]),
    manifest([entry({ size: 10, modifiedAt: 1_000_000 })]),
    pair
  )
  assert.equal(plan.items[0].action, 'update')
})

test('mtime差が2秒未満ならskipになる(FAT/NTFS対策の許容誤差)', () => {
  const plan = computePlan(
    manifest([entry({ size: 10, modifiedAt: 1_001_500 })]),
    manifest([entry({ size: 10, modifiedAt: 1_000_000 })]),
    pair
  )
  assert.equal(plan.items[0].action, 'skip')
})

test('サイズ・mtimeとも一致すればskipになる', () => {
  const plan = computePlan(
    manifest([entry({ size: 10, modifiedAt: 1_000_000 })]),
    manifest([entry({ size: 10, modifiedAt: 1_000_000 })]),
    pair
  )
  assert.equal(plan.items[0].action, 'skip')
  assert.equal(plan.summary.skips, 1)
})

test('両方に存在するフォルダはskipになる', () => {
  const plan = computePlan(
    manifest([entry({ relPath: 'sub', isDirectory: true, size: 0 })]),
    manifest([entry({ relPath: 'sub', isDirectory: true, size: 0 })]),
    pair
  )
  assert.equal(plan.items[0].action, 'skip')
})

test('同じrelPathでファイル/フォルダの種別が異なる場合はupdateになる', () => {
  const plan = computePlan(
    manifest([entry({ relPath: 'x', isDirectory: true, size: 0 })]),
    manifest([entry({ relPath: 'x', isDirectory: false, size: 5 })]),
    pair
  )
  assert.equal(plan.items[0].action, 'update')
  assert.equal(plan.items[0].reason, 'ファイル/フォルダの種別が異なる')
})

test('フォルダがまるごとdelete対象の場合、配下の個別delete項目は間引かれる', () => {
  const target = manifest([
    entry({ relPath: 'sub', isDirectory: true, size: 0 }),
    entry({ relPath: 'sub/inner.txt', size: 5 }),
    entry({ relPath: 'sub/deep', isDirectory: true, size: 0 }),
    entry({ relPath: 'sub/deep/leaf.txt', size: 3 })
  ])
  const plan = computePlan(manifest([]), target, pair)
  const deletePaths = plan.items.filter((i) => i.action === 'delete').map((i) => i.relPath)
  assert.deepEqual(deletePaths, ['sub'])
  assert.equal(plan.summary.deletes, 1)
})

test('フォルダ削除の間引きは兄弟フォルダを誤って除外しない', () => {
  const target = manifest([
    entry({ relPath: 'sub', isDirectory: true, size: 0 }),
    entry({ relPath: 'sub/inner.txt', size: 5 }),
    entry({ relPath: 'sub2', isDirectory: true, size: 0 }),
    entry({ relPath: 'sub2/other.txt', size: 5 })
  ])
  const plan = computePlan(manifest([]), target, pair)
  const deletePaths = plan.items.filter((i) => i.action === 'delete').map((i) => i.relPath).sort()
  assert.deepEqual(deletePaths, ['sub', 'sub2'])
})

test('summaryの件数がitemsの内訳と一致する', () => {
  const source = manifest([entry({ relPath: 'create-me.txt' }), entry({ relPath: 'same.txt', size: 1, modifiedAt: 1 })])
  const target = manifest([
    entry({ relPath: 'delete-me.txt' }),
    entry({ relPath: 'same.txt', size: 1, modifiedAt: 1 })
  ])
  const plan = computePlan(source, target, pair)
  assert.deepEqual(plan.summary, { creates: 1, updates: 0, deletes: 1, skips: 1 })
})
