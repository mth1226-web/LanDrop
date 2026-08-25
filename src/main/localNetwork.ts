// LAN上でスマホ等から接続するためのIPv4アドレス選定（Electron非依存、os.networkInterfaces()の結果を受け取る純粋関数）
import os from 'node:os'

export interface LanInterface {
  name: string
  address: string
}

/** 内部/ループバックを除いたIPv4インターフェース一覧を返す（Wi-Fi/有線などを選択させるため） */
export function listLanInterfaces(interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>): LanInterface[] {
  const result: LanInterface[] = []
  for (const [name, infos] of Object.entries(interfaces)) {
    if (!infos) continue
    const ipv4 = infos.find((info) => info.family === 'IPv4' && !info.internal)
    if (ipv4) result.push({ name, address: ipv4.address })
  }
  return result
}

/**
 * LAN内IPv4アドレスを選ぶ。preferredNameで指定したインターフェースが見つかればそれを、
 * 見つからない/未指定なら最初に見つかったものを返す。1つも無ければnull
 */
export function pickLanAddress(interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>, preferredName?: string | null): string | null {
  const list = listLanInterfaces(interfaces)
  if (preferredName) {
    const preferred = list.find((i) => i.name === preferredName)
    if (preferred) return preferred.address
  }
  return list[0]?.address ?? null
}

export function getLanInterfaces(): LanInterface[] {
  return listLanInterfaces(os.networkInterfaces())
}

export function getLanAddress(preferredName?: string | null): string | null {
  return pickLanAddress(os.networkInterfaces(), preferredName)
}
