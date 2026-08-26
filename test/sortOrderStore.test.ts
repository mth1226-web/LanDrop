import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  sortOrderKey,
  loadSortOrderStore,
  saveSortOrderStore,
  getCustomOrder,
  setCustomOrder,
  applyCustomOrder,
  moveInOrder
} from '../src/main/sortOrderStore'
import type { SortOrderStore } from '../src/main/sortOrderStore'

test('sortOrderKeyはpeerDeviceIdとfolderRelPathを結合する', () => {
  assert.equal(sortOrderKey('peer-1', 'Videos'), 'peer-1::Videos')
})

test('loadSortOrderStoreはファイルが無ければ空オブジェクトを返す', () => {
  const filePath = path.join(os.tmpdir(), `landrop-sortorder-missing-${Date.now()}.json`)
  assert.deepEqual(loadSortOrderStore(filePath), {})
})

test('壊れたJSONの場合は空オブジェクトを返す', () => {
  const filePath = path.join(os.tmpdir(), `landrop-sortorder-broken-${Date.now()}.json`)
  fs.writeFileSync(filePath, 'not json', 'utf-8')
  assert.deepEqual(loadSortOrderStore(filePath), {})
  fs.rmSync(filePath, { force: true })
})

test('保存した内容をそのまま読み込める', () => {
  const filePath = path.join(os.tmpdir(), `landrop-sortorder-${Date.now()}.json`)
  let store: SortOrderStore = {}
  store = setCustomOrder(store, 'peer-1::Videos', ['b.mp4', 'a.mp4'])
  saveSortOrderStore(filePath, store)
  assert.deepEqual(loadSortOrderStore(filePath), store)
  fs.rmSync(filePath, { force: true })
})

test('getCustomOrderは未設定のキーに対して空配列を返す', () => {
  assert.deepEqual(getCustomOrder({}, 'peer-1::Videos'), [])
})

test('applyCustomOrderは既知の順序を維持し、未知のものは名前順で末尾に追加する', () => {
  const result = applyCustomOrder(['a.txt', 'b.txt', 'c.txt', 'z.txt'], ['c.txt', 'a.txt'])
  assert.deepEqual(result, ['c.txt', 'a.txt', 'b.txt', 'z.txt'])
})

test('applyCustomOrderはcustomOrderに含まれるが実在しないものは無視する', () => {
  const result = applyCustomOrder(['a.txt', 'b.txt'], ['deleted.txt', 'b.txt'])
  assert.deepEqual(result, ['b.txt', 'a.txt'])
})

test('moveInOrderで項目を1つ上に移動できる', () => {
  const result = moveInOrder(['a', 'b', 'c'], 'b', 'up')
  assert.deepEqual(result, ['b', 'a', 'c'])
})

test('moveInOrderで項目を1つ下に移動できる', () => {
  const result = moveInOrder(['a', 'b', 'c'], 'b', 'down')
  assert.deepEqual(result, ['a', 'c', 'b'])
})

test('moveInOrderは先頭を上に移動しようとした場合は変化しない', () => {
  const order = ['a', 'b', 'c']
  const result = moveInOrder(order, 'a', 'up')
  assert.deepEqual(result, order)
})

test('moveInOrderは末尾を下に移動しようとした場合は変化しない', () => {
  const order = ['a', 'b', 'c']
  const result = moveInOrder(order, 'c', 'down')
  assert.deepEqual(result, order)
})

test('moveInOrderは存在しない名前を指定した場合は変化しない', () => {
  const order = ['a', 'b', 'c']
  const result = moveInOrder(order, 'x', 'up')
  assert.deepEqual(result, order)
})
