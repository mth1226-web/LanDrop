// UDPディスカバリーメッセージのシリアライズ/パース（Electron非依存の純粋関数）
import type { DiscoveryMessage } from '../shared/types'

export function serializeDiscoveryMessage(message: DiscoveryMessage): Buffer {
  return Buffer.from(JSON.stringify(message), 'utf-8')
}

export function parseDiscoveryMessage(buf: Buffer): DiscoveryMessage | null {
  let raw: unknown
  try {
    raw = JSON.parse(buf.toString('utf-8'))
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>

  if (obj.type === 'announce') {
    if (
      typeof obj.deviceId === 'string' &&
      typeof obj.deviceName === 'string' &&
      typeof obj.httpPort === 'number' &&
      Number.isInteger(obj.httpPort) &&
      obj.httpPort > 0 &&
      obj.httpPort < 65536
    ) {
      return {
        type: 'announce',
        deviceId: obj.deviceId,
        deviceName: obj.deviceName,
        httpPort: obj.httpPort
      }
    }
    return null
  }

  if (obj.type === 'goodbye') {
    if (typeof obj.deviceId === 'string') {
      return { type: 'goodbye', deviceId: obj.deviceId }
    }
    return null
  }

  if (obj.type === 'chat') {
    if (
      typeof obj.id === 'string' &&
      typeof obj.fromDeviceId === 'string' &&
      typeof obj.fromDeviceName === 'string' &&
      typeof obj.text === 'string' &&
      typeof obj.timestamp === 'number'
    ) {
      return {
        type: 'chat',
        id: obj.id,
        fromDeviceId: obj.fromDeviceId,
        fromDeviceName: obj.fromDeviceName,
        text: obj.text,
        timestamp: obj.timestamp
      }
    }
    return null
  }

  return null
}
