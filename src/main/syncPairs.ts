// フォルダ同期ペア設定の読み書き（Electron非依存、fs/pathのみ使用）
import fs from 'node:fs'
import path from 'node:path'
import type { SyncPair } from '../shared/types'

export type SyncPairStore = Record<string, SyncPair>

export function loadSyncPairStore(filePath: string): SyncPairStore {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return {}
    return parsed as SyncPairStore
  } catch {
    return {}
  }
}

export function saveSyncPairStore(filePath: string, store: SyncPairStore): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8')
}

export function listSyncPairs(store: SyncPairStore): SyncPair[] {
  return Object.values(store).sort((a, b) => a.name.localeCompare(b.name))
}

export function upsertSyncPair(store: SyncPairStore, pair: SyncPair): SyncPairStore {
  return { ...store, [pair.id]: pair }
}

export function deleteSyncPair(store: SyncPairStore, id: string): SyncPairStore {
  const next = { ...store }
  delete next[id]
  return next
}
