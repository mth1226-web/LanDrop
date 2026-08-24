import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TransferStore } from '../src/main/transferStore'

function makeStore() {
  const store = new TransferStore()
  const session = store.create({
    transferId: 't1',
    direction: 'outgoing',
    peerDeviceId: 'peer-1',
    peerDeviceName: 'PC-B',
    files: [{ fileId: 'f1', name: 'a.txt', size: 100, mimeType: 'text/plain' }],
    now: 1000
  })
  return { store, session }
}

test('作成直後はofferedかつ進捗0で初期化される', () => {
  const { session } = makeStore()
  assert.equal(session.status, 'offered')
  assert.deepEqual(session.fileProgress, { f1: { fileId: 'f1', transferredBytes: 0, totalBytes: 100 } })
})

test('offered -> accepted -> in_progress -> completed の正常系', () => {
  const { store } = makeStore()
  assert.equal(store.transition('t1', 'accepted'), true)
  assert.equal(store.transition('t1', 'in_progress'), true)
  assert.equal(store.updateProgress('t1', 'f1', 50), true)
  assert.equal(store.get('t1')?.fileProgress.f1.transferredBytes, 50)
  assert.equal(store.transition('t1', 'completed'), true)
  assert.equal(store.get('t1')?.status, 'completed')
})

test('offered -> rejected は許可される', () => {
  const { store } = makeStore()
  assert.equal(store.transition('t1', 'rejected'), true)
  assert.equal(store.get('t1')?.status, 'rejected')
})

test('offered -> timeout は許可される', () => {
  const { store } = makeStore()
  assert.equal(store.transition('t1', 'timeout'), true)
})

test('completedになった後は状態が変化しない（不正遷移は拒否）', () => {
  const { store } = makeStore()
  store.transition('t1', 'accepted')
  store.transition('t1', 'in_progress')
  store.transition('t1', 'completed')
  assert.equal(store.transition('t1', 'accepted'), false)
  assert.equal(store.transition('t1', 'failed'), false)
  assert.equal(store.get('t1')?.status, 'completed')
})

test('rejectedから直接in_progressには遷移できない', () => {
  const { store } = makeStore()
  store.transition('t1', 'rejected')
  assert.equal(store.transition('t1', 'in_progress'), false)
})

test('offeredのままではupdateProgressできない', () => {
  const { store } = makeStore()
  assert.equal(store.updateProgress('t1', 'f1', 10), false)
})

test('in_progress中にfailedへ遷移でき、errorMessageが記録される', () => {
  const { store } = makeStore()
  store.transition('t1', 'accepted')
  store.transition('t1', 'in_progress')
  assert.equal(store.transition('t1', 'failed', 'ネットワークエラー'), true)
  assert.equal(store.get('t1')?.errorMessage, 'ネットワークエラー')
})

test('存在しないtransferIdへの操作はfalseを返す', () => {
  const store = new TransferStore()
  assert.equal(store.transition('unknown', 'accepted'), false)
  assert.equal(store.updateProgress('unknown', 'f1', 1), false)
})

test('getAllは新しい順に並ぶ', () => {
  const store = new TransferStore()
  store.create({ transferId: 'old', direction: 'outgoing', peerDeviceId: 'p', peerDeviceName: 'P', files: [], now: 100 })
  store.create({ transferId: 'new', direction: 'outgoing', peerDeviceId: 'p', peerDeviceName: 'P', files: [], now: 200 })
  assert.deepEqual(store.getAll().map((s) => s.transferId), ['new', 'old'])
})
