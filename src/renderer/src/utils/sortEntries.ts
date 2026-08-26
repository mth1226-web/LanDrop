import type { BrowseEntry, SortMode } from '../../../shared/types'

/**
 * name/date順ではフォルダを先にグループ化してから並べる。
 * manual順ではフォルダ/ファイルを区別せず、customOrder(既知のものはその順、未知は名前順で末尾)で並べる。
 */
export function sortEntries(entries: BrowseEntry[], sortMode: SortMode, customOrder: string[]): BrowseEntry[] {
  if (sortMode === 'manual') {
    const byName = new Map(entries.map((e) => [e.name, e]))
    const nameSet = new Set(entries.map((e) => e.name))
    const known = customOrder.filter((n) => nameSet.has(n))
    const knownSet = new Set(known)
    const unknown = entries.filter((e) => !knownSet.has(e.name)).sort((a, b) => a.name.localeCompare(b.name))
    return [...known.map((n) => byName.get(n)!), ...unknown]
  }

  const folders = entries.filter((e) => e.isDirectory)
  const files = entries.filter((e) => !e.isDirectory)
  const comparator =
    sortMode === 'date'
      ? (a: BrowseEntry, b: BrowseEntry) => b.modifiedAt - a.modifiedAt
      : (a: BrowseEntry, b: BrowseEntry) => a.name.localeCompare(b.name)
  return [...folders.sort(comparator), ...files.sort(comparator)]
}

/** manual順における「現時点での完全な有効順序」を名前配列で返す(未知の新規項目は名前順で末尾に追加) */
export function effectiveManualOrder(entries: BrowseEntry[], customOrder: string[]): string[] {
  return sortEntries(entries, 'manual', customOrder).map((e) => e.name)
}

/** 名前配列の中でnameを上下に1つ移動する。移動できない場合はそのまま返す */
export function moveNameInOrder(order: string[], name: string, direction: 'up' | 'down'): string[] {
  const index = order.indexOf(name)
  if (index < 0) return order
  const swapIndex = direction === 'up' ? index - 1 : index + 1
  if (swapIndex < 0 || swapIndex >= order.length) return order
  const next = [...order]
  ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  return next
}

/** ドラッグ&ドロップ用: nameをtargetNameの直前/直後に移動する。targetNameが無ければそのまま返す */
export function moveNameRelativeTo(order: string[], name: string, targetName: string, after: boolean): string[] {
  const withoutName = order.filter((n) => n !== name)
  const targetIndex = withoutName.indexOf(targetName)
  if (targetIndex < 0) return order
  const insertIndex = after ? targetIndex + 1 : targetIndex
  const next = [...withoutName]
  next.splice(insertIndex, 0, name)
  return next
}
