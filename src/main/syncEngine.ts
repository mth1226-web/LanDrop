// フォルダ同期(片方向ミラー)の中核ロジック（Electron非依存）。
// computePlanは純粋関数(ファイルI/Oしない)。buildManifest/executePlanはローカルfsまたは
// 渡されたリモート接続情報(address/port)経由のHTTPを使う(self/remoteの判定自体はindex.ts側で行う)。
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { EntryOpResult, SyncDiffItem, SyncManifest, SyncPair, SyncPlan } from '../shared/types'
import { listDirectoryRecursive, resolveSafePath, moveEntry } from './sharedFs'
import {
  downloadFile,
  uploadFile,
  pasteRemote,
  trashRemote,
  createFolderRemote,
  getSyncManifestRemote
} from './transferClient'

const MTIME_TOLERANCE_MS = 2000

export function buildLocalManifest(root: string, relPath: string): SyncManifest {
  return {
    rootKey: `local:${root}${relPath ? `/${relPath}` : ''}`,
    generatedAt: Date.now(),
    entries: listDirectoryRecursive(root, relPath)
  }
}

export async function buildRemoteManifest(address: string, port: number, folder: string): Promise<SyncManifest> {
  return getSyncManifestRemote(address, port, folder)
}

/**
 * sourceに合わせてtargetを一致させるための差分を計算する。純粋関数、ファイルI/Oは一切しない。
 * 比較はsize+mtimeのみ(mtime差がMTIME_TOLERANCE_MS未満なら同じとみなす、FAT/NTFS対策)。
 * あるフォルダがまるごとdelete対象になる場合、その配下は個別のdelete項目としては出さない
 * (親をtrashすれば配下も消えるため、二重処理・存在しないパスへのtrashエラーを防ぐ)。
 */
export function computePlan(source: SyncManifest, target: SyncManifest, pair: SyncPair): SyncPlan {
  const sourceMap = new Map(source.entries.map((e) => [e.relPath, e]))
  const targetMap = new Map(target.entries.map((e) => [e.relPath, e]))
  const allPaths = new Set([...sourceMap.keys(), ...targetMap.keys()])

  const items: SyncDiffItem[] = []

  for (const relPath of allPaths) {
    const src = sourceMap.get(relPath)
    const tgt = targetMap.get(relPath)

    if (src && !tgt) {
      items.push({
        relPath,
        isDirectory: src.isDirectory,
        action: 'create',
        side: 'target',
        reason: 'ソースにのみ存在',
        sourceSize: src.isDirectory ? undefined : src.size
      })
      continue
    }

    if (!src && tgt) {
      items.push({
        relPath,
        isDirectory: tgt.isDirectory,
        action: 'delete',
        side: 'target',
        reason: 'ターゲットにのみ存在',
        targetSize: tgt.isDirectory ? undefined : tgt.size
      })
      continue
    }

    if (!src || !tgt) continue // ここには来ないはずだが型ガード

    if (src.isDirectory !== tgt.isDirectory) {
      items.push({
        relPath,
        isDirectory: src.isDirectory,
        action: 'update',
        side: 'target',
        reason: 'ファイル/フォルダの種別が異なる',
        sourceSize: src.isDirectory ? undefined : src.size,
        targetSize: tgt.isDirectory ? undefined : tgt.size
      })
      continue
    }

    if (src.isDirectory) {
      items.push({ relPath, isDirectory: true, action: 'skip', side: 'target', reason: '両方に存在するフォルダ' })
      continue
    }

    const sizeDiffers = src.size !== tgt.size
    const sourceIsNewer = src.modifiedAt - tgt.modifiedAt > MTIME_TOLERANCE_MS
    if (sizeDiffers || sourceIsNewer) {
      items.push({
        relPath,
        isDirectory: false,
        action: 'update',
        side: 'target',
        reason: sizeDiffers ? 'サイズが異なる' : 'ソースの方が新しい',
        sourceSize: src.size,
        targetSize: tgt.size
      })
    } else {
      items.push({
        relPath,
        isDirectory: false,
        action: 'skip',
        side: 'target',
        reason: '一致',
        sourceSize: src.size,
        targetSize: tgt.size
      })
    }
  }

  // あるフォルダがdelete対象なら、その配下の個別delete項目は間引く
  const deletingDirs = items
    .filter((i) => i.action === 'delete' && i.isDirectory)
    .map((i) => i.relPath)
    .sort((a, b) => a.length - b.length)
  const filtered = items.filter((item) => {
    if (item.action !== 'delete') return true
    return !deletingDirs.some((dir) => dir !== item.relPath && item.relPath.startsWith(`${dir}/`))
  })

  filtered.sort((a, b) => a.relPath.localeCompare(b.relPath))

  const summary = filtered.reduce(
    (acc, item) => {
      if (item.action === 'create') acc.creates += 1
      else if (item.action === 'update') acc.updates += 1
      else if (item.action === 'delete') acc.deletes += 1
      else acc.skips += 1
      return acc
    },
    { creates: 0, updates: 0, deletes: 0, skips: 0 }
  )

  return { pairId: pair.id, generatedAt: Date.now(), items: filtered, summary }
}

/** 実行対象の片側の接続先: nullならローカル直接fs、非nullならHTTP経由 */
export interface SyncSide {
  local: { root: string } | null
  remote: { address: string; port: number; folder: string } | null
}

export interface ExecutePlanParams {
  plan: SyncPlan
  pair: SyncPair
  /** sourceがどちらの実体を指すか(direction:'push'ならlocal、'pull'ならremote側がsource) */
  source: SyncSide
  target: SyncSide
  /** ローカル側の非バージョニング削除で使うOSごみ箱への移動(Electron依存部分はindex.tsから注入する) */
  trashLocalPath: (absPath: string) => Promise<void>
  onItemStart?: (item: SyncDiffItem) => string // TransferActivityのidを発行して返す
  onProgress?: (activityId: string, transferredBytes: number) => void
  onItemDone?: (activityId: string, ok: boolean, errorMessage?: string) => void
}

function versioningBase(pair: SyncPair): string {
  const folder = pair.versioningFolder ?? '.landrop-versions'
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19)
  return `${folder}/${stamp}`
}

async function trashOrVersionTarget(
  target: SyncSide,
  relPath: string,
  pair: SyncPair,
  trashLocalPath: (absPath: string) => Promise<void>
): Promise<void> {
  const parentRel = path.posix.dirname(relPath)
  const name = path.posix.basename(relPath)
  const parent = parentRel === '.' ? '' : parentRel

  if (target.local) {
    const absPath = resolveSafePath(target.local.root, relPath)
    if (!absPath || !fs.existsSync(absPath)) return
    if (pair.useVersioning) {
      const destRel = parent ? `${versioningBase(pair)}/${parent}` : versioningBase(pair)
      const destAbs = resolveSafePath(target.local.root, destRel)
      if (destAbs) fs.mkdirSync(destAbs, { recursive: true })
      moveEntry(target.local.root, parent, name, target.local.root, destRel)
    } else {
      await trashLocalPath(absPath)
    }
    return
  }

  if (target.remote) {
    if (pair.useVersioning) {
      const destFolder = parent
        ? `${target.remote.folder}/${versioningBase(pair)}/${parent}`
        : `${target.remote.folder}/${versioningBase(pair)}`
      await pasteRemote(
        target.remote.address,
        target.remote.port,
        `${target.remote.folder}${parent ? `/${parent}` : ''}`,
        name,
        destFolder,
        'move'
      )
    } else {
      await trashRemote(
        target.remote.address,
        target.remote.port,
        `${target.remote.folder}${parent ? `/${parent}` : ''}`,
        name
      )
    }
  }
}

/** dir作成 → ファイルcreate/update → delete の順で実行する */
export async function executePlan(params: ExecutePlanParams): Promise<EntryOpResult[]> {
  const { plan, pair, source, target } = params
  const results: EntryOpResult[] = []

  const dirCreates = plan.items
    .filter((i) => i.action === 'create' && i.isDirectory)
    .sort((a, b) => a.relPath.split('/').length - b.relPath.split('/').length)
  const fileWrites = plan.items.filter((i) => (i.action === 'create' || i.action === 'update') && !i.isDirectory)
  const deletes = plan.items
    .filter((i) => i.action === 'delete')
    .sort((a, b) => b.relPath.split('/').length - a.relPath.split('/').length)

  for (const item of dirCreates) {
    try {
      await ensureDir(target, item.relPath)
      results.push({ name: item.relPath, ok: true })
    } catch (err) {
      results.push({ name: item.relPath, ok: false, error: String(err) })
    }
  }

  for (const item of fileWrites) {
    const activityId = params.onItemStart?.(item) ?? randomUUID()
    try {
      if (item.action === 'update') {
        await trashOrVersionTarget(target, item.relPath, pair, params.trashLocalPath)
      }
      await ensureDir(target, path.posix.dirname(item.relPath))
      await transferOneFile(source, target, item.relPath, (transferred) => params.onProgress?.(activityId, transferred))
      params.onItemDone?.(activityId, true)
      results.push({ name: item.relPath, ok: true })
    } catch (err) {
      params.onItemDone?.(activityId, false, String(err))
      results.push({ name: item.relPath, ok: false, error: String(err) })
    }
  }

  for (const item of deletes) {
    try {
      await trashOrVersionTarget(target, item.relPath, pair, params.trashLocalPath)
      results.push({ name: item.relPath, ok: true })
    } catch (err) {
      results.push({ name: item.relPath, ok: false, error: String(err) })
    }
  }

  return results
}

async function ensureDir(target: SyncSide, relDir: string): Promise<void> {
  const dir = relDir === '.' || relDir === '' ? '' : relDir
  if (!dir) return
  if (target.local) {
    const abs = resolveSafePath(target.local.root, dir)
    if (!abs) throw new Error('invalid path')
    fs.mkdirSync(abs, { recursive: true })
    return
  }
  if (target.remote) {
    const segments = dir.split('/')
    let built = ''
    for (const seg of segments) {
      const parent = built
      built = built ? `${built}/${seg}` : seg
      try {
        await createFolderRemote(target.remote.address, target.remote.port, `${target.remote.folder}${parent ? `/${parent}` : ''}`, seg)
      } catch {
        // 既に存在する場合はエラーになるが、同期の実行順(浅い順)では正常系として無視してよい
      }
    }
  }
}

async function transferOneFile(
  source: SyncSide,
  target: SyncSide,
  relPath: string,
  onProgress: (transferredBytes: number) => void
): Promise<void> {
  const parentRel = path.posix.dirname(relPath)
  const parent = parentRel === '.' ? '' : parentRel
  const name = path.posix.basename(relPath)

  if (source.local && target.local) {
    const srcAbs = resolveSafePath(source.local.root, relPath)
    const destAbs = resolveSafePath(target.local.root, relPath)
    if (!srcAbs || !destAbs) throw new Error('invalid path')
    fs.copyFileSync(srcAbs, destAbs)
    return
  }

  if (source.local && target.remote) {
    const srcAbs = resolveSafePath(source.local.root, relPath)
    if (!srcAbs) throw new Error('invalid path')
    const size = fs.statSync(srcAbs).size
    await uploadFile({
      address: target.remote.address,
      port: target.remote.port,
      relPath: `${target.remote.folder}${parent ? `/${parent}` : ''}`,
      name,
      filePath: srcAbs,
      size,
      onProgress
    })
    return
  }

  if (source.remote && target.local) {
    const destAbs = resolveSafePath(target.local.root, relPath)
    if (!destAbs) throw new Error('invalid path')
    await downloadFile({
      address: source.remote.address,
      port: source.remote.port,
      relPath: `${source.remote.folder}/${relPath}`,
      destPath: destAbs,
      onProgress: (transferred) => onProgress(transferred)
    })
    return
  }

  throw new Error('source/targetの組み合わせが不正です(remote同士の直接同期は未対応)')
}
