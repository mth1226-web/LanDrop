import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Discovery } from '../src/main/discovery'
import type { ChatMessage, Peer } from '../src/shared/types'

// 127.0.0.1上で2つの実UDPソケットを立て、announce/goodbyeによる相互発見を実機なしで検証する
function randomTestPort(): number {
  return 40000 + Math.floor(Math.random() * 10000)
}

function waitForPeersChanged(discovery: Discovery, timeoutMs = 5000): Promise<Peer[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('peers-changed timeout')), timeoutMs)
    discovery.once('peers-changed', (peers) => {
      clearTimeout(timer)
      resolve(peers)
    })
  })
}

test('2つのDiscoveryインスタンスが相互に相手を発見する', async () => {
  const port = randomTestPort()
  const a = new Discovery({ deviceId: 'device-a', deviceName: 'PC-A', getHttpPort: () => 11111, port })
  const b = new Discovery({ deviceId: 'device-b', deviceName: 'PC-B', getHttpPort: () => 22222, port })

  try {
    const aSeesB = waitForPeersChanged(a)
    const bSeesA = waitForPeersChanged(b)

    a.start()
    b.start()

    const [peersOnA, peersOnB] = await Promise.all([aSeesB, bSeesA])

    assert.equal(peersOnA.length, 1)
    assert.equal(peersOnA[0].deviceId, 'device-b')
    assert.equal(peersOnA[0].httpPort, 22222)

    assert.equal(peersOnB.length, 1)
    assert.equal(peersOnB[0].deviceId, 'device-a')
    assert.equal(peersOnB[0].httpPort, 11111)
  } finally {
    a.stop()
    b.stop()
  }
})

function waitForChat(discovery: Discovery, timeoutMs = 5000): Promise<ChatMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('chat timeout')), timeoutMs)
    discovery.once('chat', (message) => {
      clearTimeout(timer)
      resolve(message)
    })
  })
}

test('broadcastChatで送った全体チャットがもう片方に届く', async () => {
  const port = randomTestPort()
  const a = new Discovery({ deviceId: 'device-a', deviceName: 'PC-A', getHttpPort: () => 11111, port })
  const b = new Discovery({ deviceId: 'device-b', deviceName: 'PC-B', getHttpPort: () => 22222, port })

  try {
    const aSeesB = waitForPeersChanged(a)
    const bSeesA = waitForPeersChanged(b)
    a.start()
    b.start()
    await Promise.all([aSeesB, bSeesA])

    const bReceivesChat = waitForChat(b)
    a.broadcastChat({ id: 'msg-1', fromDeviceId: 'device-a', fromDeviceName: 'PC-A', text: 'こんにちは', timestamp: 12345 })
    const received = await bReceivesChat

    assert.deepEqual(received, {
      id: 'msg-1',
      fromDeviceId: 'device-a',
      fromDeviceName: 'PC-A',
      text: 'こんにちは',
      timestamp: 12345
    })
  } finally {
    a.stop()
    b.stop()
  }
})

test('自分自身が送ったチャットは自分では受信しない(chatイベントが発火しない)', async () => {
  const port = randomTestPort()
  const a = new Discovery({ deviceId: 'device-a', deviceName: 'PC-A', getHttpPort: () => 11111, port })

  try {
    a.start()
    let received = false
    a.on('chat', () => {
      received = true
    })
    a.broadcastChat({ id: 'msg-1', fromDeviceId: 'device-a', fromDeviceName: 'PC-A', text: 'self', timestamp: 1 })
    await new Promise((resolve) => setTimeout(resolve, 300))
    assert.equal(received, false)
  } finally {
    a.stop()
  }
})

test('片方がstop()するとgoodbyeでもう片方の一覧から消える', async () => {
  const port = randomTestPort()
  const a = new Discovery({ deviceId: 'device-a', deviceName: 'PC-A', getHttpPort: () => 11111, port })
  const b = new Discovery({ deviceId: 'device-b', deviceName: 'PC-B', getHttpPort: () => 22222, port })

  try {
    const aSeesB = waitForPeersChanged(a)
    const bSeesA = waitForPeersChanged(b)
    a.start()
    b.start()
    await Promise.all([aSeesB, bSeesA])

    const bSeesGoodbye = waitForPeersChanged(b)
    a.stop()
    const peersOnB = await bSeesGoodbye

    assert.equal(peersOnB.length, 0)
  } finally {
    b.stop()
  }
})
