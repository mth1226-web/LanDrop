// マニュアル並び替え(フォルダごとのカスタム順序)の読み書き
// Electron非依存、fs/pathのみ使用。自分のPC内だけのローカルな並び順情報

import fs from 'node:fs'
import path from 'node:path'

export type SortOrderStore = Record<string, string[]>

/** peerDeviceIdとfolderRelPathから、並び順保存用の一意なキーを作る */
export function sortOrderKey(peerDeviceId: string, folderRelPath: string): string {
  return `${peerDeviceId}::${folderRelPath}`
}

export function loadSortOrderStore(filePath: string): SortOrderStore {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return {}
    return parsed as SortOrderStore
  } catch {
    return {}
  }
}

export function saveSortOrderStore(filePath: string, store: SortOrderStore): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8')
}

export function getCustomOrder(store: SortOrderStore, key: string): string[] {
  return store[key] ?? []
}

export function setCustomOrder(store: SortOrderStore, key: string, order: string[]): SortOrderStore {
  return { ...store, [key]: order }
}

/**
 * namesを既知のcustomOrder順に並べ、customOrderに無い(新規追加された)ものは
 * 名前順にソートして末尾に追加する
 */
export function applyCustomOrder(names: string[], customOrder: string[]): string[] {
  const nameSet = new Set(names)
  const known = customOrder.filter((n) => nameSet.has(n))
  const knownSet = new Set(known)
  const unknown = names.filter((n) => !knownSet.has(n)).sort((a, b) => a.localeCompare(b))
  return [...known, ...unknown]
}

/** orderの中でnameを上下に1つ移動する。移動できない場合はそのまま返す */
export function moveInOrder(order: string[], name: string, direction: 'up' | 'down'): string[] {
  const index = order.indexOf(name)
  if (index < 0) return order
  const swapIndex = direction === 'up' ? index - 1 : index + 1
  if (swapIndex < 0 || swapIndex >= order.length) return order
  const next = [...order]
  ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  return next
}
