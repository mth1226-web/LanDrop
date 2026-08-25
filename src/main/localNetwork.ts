// LAN上でスマホ等から接続するためのIPv4アドレス選定（Electron非依存、os.networkInterfaces()の結果を受け取る純粋関数）
import os from 'node:os'

/** 内部/ループバックを除いた最初のIPv4アドレスを返す。見つからなければnull */
export function pickLanAddress(interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>): string | null {
  for (const infos of Object.values(interfaces)) {
    if (!infos) continue
    for (const info of infos) {
      if (info.family === 'IPv4' && !info.internal) return info.address
    }
  }
  return null
}

export function getLanAddress(): string | null {
  return pickLanAddress(os.networkInterfaces())
}
