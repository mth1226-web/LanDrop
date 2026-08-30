// ファイル/フォルダごとのローカル整理情報(非表示/色/メモ/取り込み済み)の読み書き
// Electron非依存、fs/pathのみ使用。相手のPCのファイル自体には一切影響しない、閲覧側だけのローカルデータ
import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_ENTRY_METADATA } from '../shared/types'
import type { EntryMetadata } from '../shared/types'

export type EntryMetadataStore = Record<string, Partial<EntryMetadata>>

/** peerDeviceIdとrelPathから、メタデータ保存用の一意なキーを作る */
export function entryMetadataKey(peerDeviceId: string, relPath: string): string {
  return `${peerDeviceId}::${relPath}`
}

export function loadEntryMetadataStore(filePath: string): EntryMetadataStore {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return {}
    return parsed as EntryMetadataStore
  } catch {
    return {}
  }
}

export function saveEntryMetadataStore(filePath: string, store: EntryMetadataStore): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8')
}

export function getEntryMetadata(store: EntryMetadataStore, key: string): EntryMetadata {
  return { ...DEFAULT_ENTRY_METADATA, ...store[key] }
}

/** すべての値がデフォルトと同じなら、ストアを肥大化させないためエントリごと削除する */
export function setEntryMetadata(store: EntryMetadataStore, key: string, patch: Partial<EntryMetadata>): EntryMetadataStore {
  const merged = { ...getEntryMetadata(store, key), ...patch }
  const next = { ...store }
  if (
    merged.hidden === DEFAULT_ENTRY_METADATA.hidden &&
    merged.color === DEFAULT_ENTRY_METADATA.color &&
    merged.memo === DEFAULT_ENTRY_METADATA.memo &&
    merged.imported === DEFAULT_ENTRY_METADATA.imported
  ) {
    delete next[key]
  } else {
    next[key] = merged
  }
  return next
}

/** 親フォルダのrelPathと子要素名から、その子要素自身のrelPathを組み立てる */
export function childRelPath(parentRelPath: string, name: string): string {
  return parentRelPath ? `${parentRelPath}/${name}` : name
}

/** parentRelPath配下の子要素(childNames)のメタデータをまとめて取得する(1回のIPCで済ませるため) */
export function getEntryMetadataForChildren(
  store: EntryMetadataStore,
  peerDeviceId: string,
  parentRelPath: string,
  childNames: string[]
): Record<string, EntryMetadata> {
  const result: Record<string, EntryMetadata> = {}
  for (const name of childNames) {
    result[name] = getEntryMetadata(store, entryMetadataKey(peerDeviceId, childRelPath(parentRelPath, name)))
  }
  return result
}

/**
 * リネームに合わせて、ローカルメタデータ(色/メモ/非表示/取り込み済み)のキーを旧名から新名へ引き継ぐ。
 * これをしないと、リネーム後は新しい名前に対応するキーが存在せず、色などがデフォルトに戻って見えてしまう。
 */
export function renameEntryMetadataKey(
  store: EntryMetadataStore,
  peerDeviceId: string,
  parentRelPath: string,
  oldName: string,
  newName: string
): EntryMetadataStore {
  const oldKey = entryMetadataKey(peerDeviceId, childRelPath(parentRelPath, oldName))
  if (!(oldKey in store)) return store
  const newKey = entryMetadataKey(peerDeviceId, childRelPath(parentRelPath, newName))
  const next = { ...store }
  next[newKey] = next[oldKey]
  delete next[oldKey]
  return next
}
