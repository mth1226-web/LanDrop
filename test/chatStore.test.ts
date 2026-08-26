import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  loadChatStore,
  saveChatStore,
  appendBroadcastMessage,
  appendDirectMessage,
  clearBroadcastLog,
  clearDirectLog,
  getBroadcastLog,
  getDirectLog
} from '../src/main/chatStore'
import type { ChatStore } from '../src/main/chatStore'

function makeMessage(id: string, fromDeviceId = 'peer-1'): { id: string; fromDeviceId: string; fromDeviceName: string; text: string; timestamp: number } {
  return { id, fromDeviceId, fromDeviceName: 'PC-B', text: `text-${id}`, timestamp: Date.now() }
}

test('loadChatStoreはファイルが無ければ空のログを返す', () => {
  const filePath = path.join(os.tmpdir(), `landrop-chat-missing-${Date.now()}.json`)
  assert.deepEqual(loadChatStore(filePath), { broadcast: [], direct: {} })
})

test('壊れたJSONの場合は空のログを返す', () => {
  const filePath = path.join(os.tmpdir(), `landrop-chat-broken-${Date.now()}.json`)
  fs.writeFileSync(filePath, 'not json', 'utf-8')
  assert.deepEqual(loadChatStore(filePath), { broadcast: [], direct: {} })
  fs.rmSync(filePath, { force: true })
})

test('保存した内容をそのまま読み込める', () => {
  const filePath = path.join(os.tmpdir(), `landrop-chat-${Date.now()}.json`)
  let store: ChatStore = { broadcast: [], direct: {} }
  store = appendBroadcastMessage(store, makeMessage('b1'))
  store = appendDirectMessage(store, 'peer-1', makeMessage('d1'))
  saveChatStore(filePath, store)
  assert.deepEqual(loadChatStore(filePath), store)
  fs.rmSync(filePath, { force: true })
})

test('appendBroadcastMessageは同じidのメッセージを重複追加しない', () => {
  let store: ChatStore = { broadcast: [], direct: {} }
  const msg = makeMessage('b1')
  store = appendBroadcastMessage(store, msg)
  store = appendBroadcastMessage(store, msg)
  assert.equal(getBroadcastLog(store).length, 1)
})

test('appendDirectMessageは相手deviceIdごとに別のログとして積まれる', () => {
  let store: ChatStore = { broadcast: [], direct: {} }
  store = appendDirectMessage(store, 'peer-1', makeMessage('d1', 'peer-1'))
  store = appendDirectMessage(store, 'peer-2', makeMessage('d2', 'peer-2'))
  assert.equal(getDirectLog(store, 'peer-1').length, 1)
  assert.equal(getDirectLog(store, 'peer-2').length, 1)
  assert.equal(getDirectLog(store, 'peer-3').length, 0)
})

test('clearBroadcastLogは全体チャットのみ空にする', () => {
  let store: ChatStore = { broadcast: [], direct: {} }
  store = appendBroadcastMessage(store, makeMessage('b1'))
  store = appendDirectMessage(store, 'peer-1', makeMessage('d1'))
  store = clearBroadcastLog(store)
  assert.equal(getBroadcastLog(store).length, 0)
  assert.equal(getDirectLog(store, 'peer-1').length, 1)
})

test('clearDirectLogは指定した相手のログだけ削除する', () => {
  let store: ChatStore = { broadcast: [], direct: {} }
  store = appendDirectMessage(store, 'peer-1', makeMessage('d1', 'peer-1'))
  store = appendDirectMessage(store, 'peer-2', makeMessage('d2', 'peer-2'))
  store = clearDirectLog(store, 'peer-1')
  assert.equal(getDirectLog(store, 'peer-1').length, 0)
  assert.equal(getDirectLog(store, 'peer-2').length, 1)
})
