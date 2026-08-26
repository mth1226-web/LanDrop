// UDPブロードキャストによるピア発見のIO層（dgramのみ使用、Electron非依存）
import dgram from 'node:dgram'
import { EventEmitter } from 'node:events'
import { DiscoveryStore, PEER_TTL_MS } from './discoveryStore'
import { parseDiscoveryMessage, serializeDiscoveryMessage } from './protocol'
import type { ChatMessage, Peer } from '../shared/types'

export const DISCOVERY_PORT = 48737
const ANNOUNCE_INTERVAL_MS = 3000
const PRUNE_INTERVAL_MS = 5000
const BROADCAST_ADDRESS = '255.255.255.255'

export interface DiscoveryOptions {
  deviceId: string
  deviceName: string
  getHttpPort: () => number
  port?: number
}

export declare interface Discovery {
  on(event: 'peers-changed', listener: (peers: Peer[]) => void): this
  on(event: 'chat', listener: (message: ChatMessage) => void): this
  emit(event: 'peers-changed', peers: Peer[]): boolean
  emit(event: 'chat', message: ChatMessage): boolean
}

export class Discovery extends EventEmitter {
  private readonly store: DiscoveryStore
  private readonly options: Required<DiscoveryOptions>
  private socket: dgram.Socket | null = null
  private announceTimer: ReturnType<typeof setInterval> | null = null
  private pruneTimer: ReturnType<typeof setInterval> | null = null

  constructor(options: DiscoveryOptions) {
    super()
    this.options = { port: DISCOVERY_PORT, ...options }
    this.store = new DiscoveryStore(options.deviceId)
  }

  start(): void {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    this.socket = socket

    socket.on('message', (msg, rinfo) => {
      const parsed = parseDiscoveryMessage(msg)
      if (!parsed) return
      if (parsed.type === 'announce') {
        const changed = this.store.handleAnnounce(parsed, rinfo.address, Date.now())
        if (changed) this.emit('peers-changed', this.store.getPeers())
      } else if (parsed.type === 'goodbye') {
        const removed = this.store.handleGoodbye(parsed)
        if (removed) this.emit('peers-changed', this.store.getPeers())
      } else if (parsed.type === 'chat') {
        if (parsed.fromDeviceId === this.options.deviceId) return
        this.emit('chat', {
          id: parsed.id,
          fromDeviceId: parsed.fromDeviceId,
          fromDeviceName: parsed.fromDeviceName,
          text: parsed.text,
          timestamp: parsed.timestamp
        })
      }
    })

    socket.on('listening', () => {
      socket.setBroadcast(true)
      this.sendAnnounce()
    })

    socket.bind(this.options.port)

    this.announceTimer = setInterval(() => this.sendAnnounce(), ANNOUNCE_INTERVAL_MS)
    this.pruneTimer = setInterval(() => {
      const expired = this.store.pruneExpired(Date.now(), PEER_TTL_MS)
      if (expired.length > 0) this.emit('peers-changed', this.store.getPeers())
    }, PRUNE_INTERVAL_MS)
  }

  stop(): void {
    if (this.announceTimer) clearInterval(this.announceTimer)
    if (this.pruneTimer) clearInterval(this.pruneTimer)
    this.announceTimer = null
    this.pruneTimer = null

    if (this.socket) {
      const socket = this.socket
      this.socket = null
      const goodbye = serializeDiscoveryMessage({ type: 'goodbye', deviceId: this.options.deviceId })
      // send()は非同期でOSに送信要求を渡すため、その完了(またはエラー)を待ってからcloseする
      // （closeを即時に呼ぶと送信前にソケットが破棄され、goodbyeが相手に届かないことがある）
      socket.send(goodbye, this.options.port, BROADCAST_ADDRESS, () => socket.close())
    }
  }

  getPeers(): Peer[] {
    return this.store.getPeers()
  }

  setDeviceName(deviceName: string): void {
    this.options.deviceName = deviceName
  }

  /** 全体チャットメッセージをLAN内にブロードキャストする */
  broadcastChat(message: ChatMessage): void {
    if (!this.socket) return
    const payload = serializeDiscoveryMessage({ type: 'chat', ...message })
    this.socket.send(payload, this.options.port, BROADCAST_ADDRESS)
  }

  private sendAnnounce(): void {
    if (!this.socket) return
    const message = serializeDiscoveryMessage({
      type: 'announce',
      deviceId: this.options.deviceId,
      deviceName: this.options.deviceName,
      httpPort: this.options.getHttpPort()
    })
    this.socket.send(message, this.options.port, BROADCAST_ADDRESS)
  }
}
