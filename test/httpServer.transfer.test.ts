import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { HttpServer } from '../src/main/httpServer'
import { TransferStore } from '../src/main/transferStore'
import { sendOffer, sendOfferResponse, sendFile } from '../src/main/transferClient'
import type { TransferSession } from '../src/shared/types'

// 実httpサーバー2台(送信側A/受信側B)をlocalhostに立て、offer→accept→streaming→保存 / offer→rejectを検証する

function makeServer(): { server: HttpServer; store: TransferStore; saveFolder: string } {
  const store = new TransferStore()
  const saveFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'landrop-test-'))
  const server = new HttpServer({ transferStore: store, getSaveFolder: () => saveFolder })
  return { server, store, saveFolder }
}

test('offer -> accept -> ファイル転送で受信側に保存され completed になる', async () => {
  const a = makeServer()
  const b = makeServer()
  const portA = await a.server.start(0)
  const portB = await b.server.start(0)

  try {
    a.store.create({
      transferId: 't1',
      direction: 'outgoing',
      peerDeviceId: 'device-b',
      peerDeviceName: 'PC-B',
      files: [{ fileId: 'f1', name: 'hello.txt', size: 13, mimeType: 'text/plain' }],
      now: Date.now()
    })

    const offerReceived = once(b.server, 'offer')
    await sendOffer('127.0.0.1', portB, {
      transferId: 't1',
      fromDeviceId: 'device-a',
      fromDeviceName: 'PC-A',
      fromHttpPort: portA,
      files: [{ fileId: 'f1', name: 'hello.txt', size: 13, mimeType: 'text/plain' }]
    })
    const [offerPayload] = await offerReceived
    assert.equal(offerPayload.session.status, 'offered')
    assert.equal(offerPayload.fromHttpPort, portA)

    // 受信側(B)がユーザーの承諾を受けて自分のstoreを更新し、送信側(A)へ応答を返す
    b.store.transition('t1', 'accepted')
    const offerResponseReceived = once(a.server, 'offer-response')
    await sendOfferResponse('127.0.0.1', portA, { transferId: 't1', decision: 'accepted' })
    const [respondedSession] = (await offerResponseReceived) as [TransferSession]
    assert.equal(respondedSession.status, 'accepted')

    const tempFile = path.join(os.tmpdir(), `landrop-src-${Date.now()}.txt`)
    fs.writeFileSync(tempFile, 'hello, world!')

    const progressEvents: number[] = []
    b.server.on('transfer-progress', (session) => {
      progressEvents.push(session.fileProgress.f1.transferredBytes)
    })

    const completed = once(b.server, 'transfer-completed')
    await sendFile({ address: '127.0.0.1', port: portB, transferId: 't1', fileId: 'f1', filePath: tempFile, size: 13 })
    const [completedSession] = (await completed) as [TransferSession]

    assert.equal(completedSession.status, 'completed')
    assert.equal(fs.readFileSync(path.join(b.saveFolder, 'hello.txt'), 'utf-8'), 'hello, world!')
    assert.ok(progressEvents.length > 0)

    fs.rmSync(tempFile, { force: true })
  } finally {
    await a.server.stop()
    await b.server.stop()
    fs.rmSync(a.saveFolder, { recursive: true, force: true })
    fs.rmSync(b.saveFolder, { recursive: true, force: true })
  }
})

test('offer -> reject の場合、送信側のセッションはrejectedになりファイル送信は拒否される', async () => {
  const a = makeServer()
  const b = makeServer()
  const portA = await a.server.start(0)
  const portB = await b.server.start(0)

  try {
    a.store.create({
      transferId: 't2',
      direction: 'outgoing',
      peerDeviceId: 'device-b',
      peerDeviceName: 'PC-B',
      files: [{ fileId: 'f1', name: 'secret.txt', size: 5, mimeType: 'text/plain' }],
      now: Date.now()
    })

    const offerReceived = once(b.server, 'offer')
    await sendOffer('127.0.0.1', portB, {
      transferId: 't2',
      fromDeviceId: 'device-a',
      fromDeviceName: 'PC-A',
      fromHttpPort: portA,
      files: [{ fileId: 'f1', name: 'secret.txt', size: 5, mimeType: 'text/plain' }]
    })
    await offerReceived

    b.store.transition('t2', 'rejected')
    const offerResponseReceived = once(a.server, 'offer-response')
    await sendOfferResponse('127.0.0.1', portA, { transferId: 't2', decision: 'rejected' })
    const [respondedSession] = (await offerResponseReceived) as [TransferSession]
    assert.equal(respondedSession.status, 'rejected')

    const tempFile = path.join(os.tmpdir(), `landrop-src2-${Date.now()}.txt`)
    fs.writeFileSync(tempFile, 'nope!')

    await assert.rejects(() =>
      sendFile({ address: '127.0.0.1', port: portB, transferId: 't2', fileId: 'f1', filePath: tempFile, size: 5 })
    )
    assert.equal(fs.existsSync(path.join(b.saveFolder, 'secret.txt')), false)

    fs.rmSync(tempFile, { force: true })
  } finally {
    await a.server.stop()
    await b.server.stop()
    fs.rmSync(a.saveFolder, { recursive: true, force: true })
    fs.rmSync(b.saveFolder, { recursive: true, force: true })
  }
})
