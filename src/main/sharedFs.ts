// 共有フォルダ内でのパス解決・一覧・作成・改名（Electron非依存、fs/pathのみ使用）
// すべての操作は必ずresolveSafePathを通し、共有ルートの外にアクセスできないことを保証する
import fs from 'node:fs'
import path from 'node:path'
import type { BrowseEntry } from '../shared/types'

/** rootの外に出るrelPathはnullを返す（パストラバーサル対策） */
export function resolveSafePath(root: string, relPath: string): string | null {
  const rootResolved = path.resolve(root)
  const targetResolved = path.resolve(rootResolved, `.${path.sep}${relPath ?? ''}`)
  if (targetResolved !== rootResolved && !targetResolved.startsWith(rootResolved + path.sep)) {
    return null
  }
  return targetResolved
}

export function listDirectory(root: string, relPath: string): BrowseEntry[] {
  const dir = resolveSafePath(root, relPath)
  if (!dir) throw new Error('invalid path')
  const names = fs.readdirSync(dir, { withFileTypes: true })
  const entries: BrowseEntry[] = names.map((entry) => {
    const stat = fs.statSync(path.join(dir, entry.name))
    return {
      name: entry.name,
      isDirectory: entry.isDirectory(),
      size: stat.size,
      modifiedAt: stat.mtimeMs
    }
  })
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return entries
}

const INVALID_NAME_CHARS = /[\\/:*?"<>|]/

export function isValidEntryName(name: string): boolean {
  return name.trim().length > 0 && !INVALID_NAME_CHARS.test(name) && name !== '.' && name !== '..'
}

export function createFolder(root: string, relPath: string, name: string): void {
  if (!isValidEntryName(name)) throw new Error('invalid name')
  const parent = resolveSafePath(root, relPath)
  if (!parent) throw new Error('invalid path')
  const target = path.join(parent, name)
  if (fs.existsSync(target)) throw new Error('already exists')
  fs.mkdirSync(target, { recursive: true })
}

export function renameEntry(root: string, relPath: string, oldName: string, newName: string): void {
  if (!isValidEntryName(newName)) throw new Error('invalid name')
  const parent = resolveSafePath(root, relPath)
  if (!parent) throw new Error('invalid path')
  const from = path.join(parent, oldName)
  const to = path.join(parent, newName)
  if (!fs.existsSync(from)) throw new Error('not found')
  if (fs.existsSync(to)) throw new Error('already exists')
  fs.renameSync(from, to)
}

export function ensureSharedFolder(root: string): void {
  fs.mkdirSync(root, { recursive: true })
}
