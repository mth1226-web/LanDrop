import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  entryMetadataKey,
  loadEntryMetadataStore,
  saveEntryMetadataStore,
  getEntryMetadata,
  setEntryMetadata,
  getEntryMetadataForChildren,
  renameEntryMetadataKey
} from '../src/main/entryMetadata'
import type { EntryMetadataStore } from '../src/main/entryMetadata'

test('entryMetadataKeyはpeerDeviceIdとrelPathを結合する', () => {
  assert.equal(entryMetadataKey('peer-1', 'Videos/a.mp4'), 'peer-1::Videos/a.mp4')
})

test('未設定のキーはデフォルト値を返す', () => {
  const meta = getEntryMetadata({}, 'peer-1::a.txt')
  assert.deepEqual(meta, { hidden: false, color: null, memo: '', imported: false })
})

test('setEntryMetadataで一部フィールドだけ更新できる(他は保持される)', () => {
  let store: EntryMetadataStore = {}
  store = setEntryMetadata(store, 'k1', { color: '#ff0000' })
  store = setEntryMetadata(store, 'k1', { memo: 'メモ' })
  assert.deepEqual(getEntryMetadata(store, 'k1'), { hidden: false, color: '#ff0000', memo: 'メモ', imported: false })
})

test('すべてデフォルトに戻るとストアからエントリが削除される', () => {
  let store: EntryMetadataStore = {}
  store = setEntryMetadata(store, 'k1', { hidden: true })
  assert.ok('k1' in store)
  store = setEntryMetadata(store, 'k1', { hidden: false })
  assert.ok(!('k1' in store))
})

test('loadEntryMetadataStoreはファイルが無ければ空オブジェクトを返す', () => {
  const filePath = path.join(os.tmpdir(), `landrop-metadata-missing-${Date.now()}.json`)
  assert.deepEqual(loadEntryMetadataStore(filePath), {})
})

test('保存した内容をそのまま読み込める', () => {
  const filePath = path.join(os.tmpdir(), `landrop-metadata-${Date.now()}.json`)
  const store = { 'peer-1::a.txt': { hidden: true, color: '#00ff00', memo: 'x', imported: true } }
  saveEntryMetadataStore(filePath, store)
  assert.deepEqual(loadEntryMetadataStore(filePath), store)
  fs.rmSync(filePath, { force: true })
})

test('壊れたJSONの場合は空オブジェクトを返す', () => {
  const filePath = path.join(os.tmpdir(), `landrop-metadata-broken-${Date.now()}.json`)
  fs.writeFileSync(filePath, 'not json', 'utf-8')
  assert.deepEqual(loadEntryMetadataStore(filePath), {})
  fs.rmSync(filePath, { force: true })
})

test('getEntryMetadataForChildrenは子要素のメタデータをまとめて返す', () => {
  let store: EntryMetadataStore = {}
  store = setEntryMetadata(store, entryMetadataKey('peer-1', 'Videos/a.mp4'), { imported: true })
  const result = getEntryMetadataForChildren(store, 'peer-1', 'Videos', ['a.mp4', 'b.mp4'])
  assert.equal(result['a.mp4'].imported, true)
  assert.equal(result['b.mp4'].imported, false)
})

test('getEntryMetadataForChildrenはルート直下(parentRelPathが空)でも正しいキーを作る', () => {
  let store: EntryMetadataStore = {}
  store = setEntryMetadata(store, entryMetadataKey('peer-1', 'Videos'), { color: '#123456' })
  const result = getEntryMetadataForChildren(store, 'peer-1', '', ['Videos'])
  assert.equal(result['Videos'].color, '#123456')
})

test('renameEntryMetadataKeyはリネームに合わせて色などのメタデータを新しい名前へ引き継ぐ', () => {
  let store: EntryMetadataStore = {}
  store = setEntryMetadata(store, entryMetadataKey('peer-1', 'Videos/old.mp4'), { color: '#123456' })
  store = renameEntryMetadataKey(store, 'peer-1', 'Videos', 'old.mp4', 'new.mp4')
  const result = getEntryMetadataForChildren(store, 'peer-1', 'Videos', ['old.mp4', 'new.mp4'])
  assert.equal(result['old.mp4'].color, null)
  assert.equal(result['new.mp4'].color, '#123456')
})

test('renameEntryMetadataKeyはルート直下(parentRelPathが空)でも正しく引き継ぐ', () => {
  let store: EntryMetadataStore = {}
  store = setEntryMetadata(store, entryMetadataKey('peer-1', 'old.txt'), { imported: true })
  store = renameEntryMetadataKey(store, 'peer-1', '', 'old.txt', 'new.txt')
  const result = getEntryMetadataForChildren(store, 'peer-1', '', ['old.txt', 'new.txt'])
  assert.equal(result['old.txt'].imported, false)
  assert.equal(result['new.txt'].imported, true)
})

test('renameEntryMetadataKeyは元にメタデータが無ければ何もしない', () => {
  const store: EntryMetadataStore = {}
  const next = renameEntryMetadataKey(store, 'peer-1', 'Videos', 'old.mp4', 'new.mp4')
  assert.deepEqual(next, {})
})
