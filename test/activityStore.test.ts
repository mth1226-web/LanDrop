import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ActivityStore } from '../src/main/activityStore'

function makeStore() {
  const store = new ActivityStore()
  const activity = store.create({
    id: 'a1',
    direction: 'upload',
    peerDeviceId: 'peer-1',
    peerDeviceName: 'PC-B',
    fileName: 'file.txt',
    totalBytes: 100,
    now: 1000
  })
  return { store, activity }
}

test('作成直後はin_progressかつ進捗0で初期化される', () => {
  const { activity } = makeStore()
  assert.equal(activity.status, 'in_progress')
  assert.equal(activity.transferredBytes, 0)
  assert.equal(activity.totalBytes, 100)
})

test('updateProgressで進捗が更新される', () => {
  const { store } = makeStore()
  assert.equal(store.updateProgress('a1', 50), true)
  assert.equal(store.get('a1')?.transferredBytes, 50)
})

test('completeでcompletedになりtransferredBytesがtotalBytesに揃う', () => {
  const { store } = makeStore()
  store.updateProgress('a1', 40)
  assert.equal(store.complete('a1'), true)
  assert.equal(store.get('a1')?.status, 'completed')
  assert.equal(store.get('a1')?.transferredBytes, 100)
})

test('completed後はupdateProgressできない', () => {
  const { store } = makeStore()
  store.complete('a1')
  assert.equal(store.updateProgress('a1', 10), false)
})

test('failでfailedになりerrorMessageが記録される', () => {
  const { store } = makeStore()
  assert.equal(store.fail('a1', 'ネットワークエラー'), true)
  assert.equal(store.get('a1')?.status, 'failed')
  assert.equal(store.get('a1')?.errorMessage, 'ネットワークエラー')
})

test('failed後はcompleteできない', () => {
  const { store } = makeStore()
  store.fail('a1', 'err')
  assert.equal(store.complete('a1'), false)
})

test('存在しないidへの操作はfalseを返す', () => {
  const store = new ActivityStore()
  assert.equal(store.updateProgress('unknown', 1), false)
  assert.equal(store.complete('unknown'), false)
  assert.equal(store.fail('unknown', 'x'), false)
})

test('getAllは新しい順に並ぶ', () => {
  const store = new ActivityStore()
  store.create({ id: 'old', direction: 'upload', peerDeviceId: 'p', peerDeviceName: 'P', fileName: 'a', totalBytes: 1, now: 100 })
  store.create({ id: 'new', direction: 'download', peerDeviceId: 'p', peerDeviceName: 'P', fileName: 'b', totalBytes: 1, now: 200 })
  assert.deepEqual(store.getAll().map((a) => a.id), ['new', 'old'])
})
