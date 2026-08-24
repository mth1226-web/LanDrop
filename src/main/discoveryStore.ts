// ピア一覧の追加/更新/TTL失効/自己フィルタを扱う純粋なストア（IOなし、node:testで直接検証可能）
import type { DeviceAnnounce, DeviceGoodbye, Peer } from '../shared/types'

export const PEER_TTL_MS = 15_000

export class DiscoveryStore {
  private readonly selfDeviceId: string
  private readonly peers = new Map<string, Peer>()

  constructor(selfDeviceId: string) {
    this.selfDeviceId = selfDeviceId
  }

  /** announceを受信した際に呼ぶ。自分自身からのannounceは無視する。戻り値は一覧が変化したか */
  handleAnnounce(message: DeviceAnnounce, fromAddress: string, now: number): boolean {
    if (message.deviceId === this.selfDeviceId) return false
    const existing = this.peers.get(message.deviceId)
    this.peers.set(message.deviceId, {
      deviceId: message.deviceId,
      deviceName: message.deviceName,
      address: fromAddress,
      httpPort: message.httpPort,
      lastSeenAt: now
    })
    return (
      !existing ||
      existing.deviceName !== message.deviceName ||
      existing.address !== fromAddress ||
      existing.httpPort !== message.httpPort
    )
  }

  /** goodbyeを受信した際に呼ぶ。戻り値は実際に削除されたか */
  handleGoodbye(message: DeviceGoodbye): boolean {
    return this.peers.delete(message.deviceId)
  }

  /** TTLを過ぎたピアを一覧から取り除く。戻り値は取り除かれたピアの配列 */
  pruneExpired(now: number, ttlMs: number = PEER_TTL_MS): Peer[] {
    const expired: Peer[] = []
    for (const [deviceId, peer] of this.peers) {
      if (now - peer.lastSeenAt > ttlMs) {
        expired.push(peer)
        this.peers.delete(deviceId)
      }
    }
    return expired
  }

  getPeers(): Peer[] {
    return Array.from(this.peers.values()).sort((a, b) => a.deviceName.localeCompare(b.deviceName))
  }

  getPeer(deviceId: string): Peer | undefined {
    return this.peers.get(deviceId)
  }
}
