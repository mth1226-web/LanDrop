// 共有フォルダ内でのパス解決・一覧・作成・改名（Electron非依存、fs/pathのみ使用）
// すべての操作は必ずresolveSafePathを通し、共有ルートの外にアクセスできないことを保証する
import fs from 'node:fs'
import path from 'node:path'
import archiver from 'archiver'
import extractZip from 'extract-zip'
import type { BrowseEntry } from '../shared/types'
import { resolveUniquePath } from './fileSave'
import { readFinderTagColor, writeFinderTagColor } from './finderTags'

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
    const entryPath = path.join(dir, entry.name)
    const stat = fs.statSync(entryPath)
    return {
      name: entry.name,
      isDirectory: entry.isDirectory(),
      size: stat.size,
      modifiedAt: stat.mtimeMs,
      finderTagColor: readFinderTagColor(entryPath)
    }
  })
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return entries
}

/** 指定したエントリのFinderカラータグを設定する(Mac以外では何もしない) */
export function setEntryFinderTagColor(root: string, relPath: string, name: string, colorHex: string | null): void {
  const parent = resolveSafePath(root, relPath)
  if (!parent) throw new Error('invalid path')
  const target = path.join(parent, name)
  if (!fs.existsSync(target)) throw new Error('not found')
  writeFinderTagColor(target, colorHex)
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

/** rename/copy後にtoへFinderタグ色を再設定する(colorがnullなら何もしない)。書き込みに失敗しても無視する */
function reapplyFinderTagColor(to: string, color: string | null): void {
  if (!color) return
  try {
    writeFinderTagColor(to, color)
  } catch {
    // Mac以外、またはタグ書き込みに失敗した場合はあきらめる(元々のFinderタグ次第の表示になる)
  }
}

export function renameEntry(root: string, relPath: string, oldName: string, newName: string): void {
  if (!isValidEntryName(newName)) throw new Error('invalid name')
  const parent = resolveSafePath(root, relPath)
  if (!parent) throw new Error('invalid path')
  const from = path.join(parent, oldName)
  const to = path.join(parent, newName)
  if (!fs.existsSync(from)) throw new Error('not found')
  if (fs.existsSync(to)) throw new Error('already exists')
  // renameSync自体はxattrを保持するはずだが、環境によって失われる場合があるため明示的に読み直して付け直す
  const tagColor = readFinderTagColor(from)
  fs.renameSync(from, to)
  reapplyFinderTagColor(to, tagColor)
}

/** srcが(root, relPath)配下にあるとして、それをdestの祖先に含んでいないか(自分自身への再帰コピー防止) */
function isInsideOrSame(destParent: string, src: string): boolean {
  const srcResolved = path.resolve(src) + path.sep
  const destResolved = path.resolve(destParent) + path.sep
  return destResolved === srcResolved || destResolved.startsWith(srcResolved)
}

/** エントリを別フォルダ(同じ共有ルート内でも別ルートでもよい)へコピーする。衝突する場合は連番を振る。実際に付いたファイル名を返す */
export function copyEntry(
  srcRoot: string,
  srcRelPath: string,
  name: string,
  destRoot: string,
  destRelPath: string
): string {
  const srcParent = resolveSafePath(srcRoot, srcRelPath)
  const destParent = resolveSafePath(destRoot, destRelPath)
  if (!srcParent || !destParent) throw new Error('invalid path')
  const from = path.join(srcParent, name)
  if (!fs.existsSync(from)) throw new Error('not found')
  if (fs.statSync(from).isDirectory() && isInsideOrSame(destParent, from)) {
    throw new Error('cannot copy a folder into itself')
  }
  const to = resolveUniquePath(destParent, name)
  const tagColor = readFinderTagColor(from)
  fs.cpSync(from, to, { recursive: true })
  reapplyFinderTagColor(to, tagColor)
  return path.basename(to)
}

/** コピーしてから元を削除することで「移動」を実現する(ドライブをまたいでも安全に動く)。実際に付いたファイル名を返す */
export function moveEntry(
  srcRoot: string,
  srcRelPath: string,
  name: string,
  destRoot: string,
  destRelPath: string
): string {
  const srcParent = resolveSafePath(srcRoot, srcRelPath)
  if (!srcParent) throw new Error('invalid path')
  const from = path.join(srcParent, name)
  if (!fs.existsSync(from)) throw new Error('not found')
  const newName = copyEntry(srcRoot, srcRelPath, name, destRoot, destRelPath)
  fs.rmSync(from, { recursive: true, force: true })
  return newName
}

/** 選択した複数のファイル/フォルダを、同じ場所に新しいzipファイルとしてまとめる。実際に付いたzipのファイル名を返す */
export async function compressEntries(root: string, relPath: string, names: string[]): Promise<string> {
  const parent = resolveSafePath(root, relPath)
  if (!parent) throw new Error('invalid path')
  if (names.length === 0) throw new Error('no entries')
  for (const name of names) {
    if (!fs.existsSync(path.join(parent, name))) throw new Error('not found')
  }
  const zipBaseName = names.length === 1 ? `${names[0]}.zip` : '圧縮.zip'
  const destPath = resolveUniquePath(parent, zipBaseName)

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(destPath)
    const archive = archiver('zip', { zlib: { level: 6 } })
    output.on('close', () => resolve())
    archive.on('error', reject)
    archive.pipe(output)
    for (const name of names) {
      const abs = path.join(parent, name)
      if (fs.statSync(abs).isDirectory()) archive.directory(abs, name)
      else archive.file(abs, { name })
    }
    void archive.finalize()
  })

  return path.basename(destPath)
}

/** zipファイルを、同じ場所に(zip名から".zip"を除いた)新しいフォルダとして展開する。実際に付いたフォルダ名を返す */
export async function extractZipEntry(root: string, relPath: string, name: string): Promise<string> {
  const parent = resolveSafePath(root, relPath)
  if (!parent) throw new Error('invalid path')
  const zipPath = path.join(parent, name)
  if (!fs.existsSync(zipPath)) throw new Error('not found')
  const baseName = name.toLowerCase().endsWith('.zip') ? name.slice(0, -4) : name
  const destDir = resolveUniquePath(parent, baseName || 'archive')
  await extractZip(zipPath, { dir: destDir })
  return path.basename(destDir)
}

export function ensureSharedFolder(root: string): void {
  fs.mkdirSync(root, { recursive: true })
}

/** 共有フォルダのパス一覧から、表示名(basename)が重複しないようラベル付けする */
export function computeFolderLabels(folders: string[]): Array<{ label: string; path: string }> {
  const usedLabels = new Set<string>()
  return folders.map((folderPath) => {
    const base = path.basename(folderPath) || folderPath
    let label = base
    let n = 2
    while (usedLabels.has(label)) {
      label = `${base} (${n})`
      n += 1
    }
    usedLabels.add(label)
    return { label, path: folderPath }
  })
}

/** 複数の共有フォルダをルート直下の仮想フォルダとして一覧表示する */
export function listSharedRoots(folders: string[]): BrowseEntry[] {
  const entries = computeFolderLabels(folders).map(({ label, path: folderPath }) => {
    let modifiedAt = Date.now()
    try {
      modifiedAt = fs.statSync(folderPath).mtimeMs
    } catch {
      // 共有フォルダが見つからない場合は現在時刻のままにしておく
    }
    return { name: label, isDirectory: true, size: 0, modifiedAt, finderTagColor: readFinderTagColor(folderPath) }
  })
  entries.sort((a, b) => a.name.localeCompare(b.name))
  return entries
}

/** relPathの先頭セグメント(共有フォルダのラベル)を実パスに解決する。見つからなければnull */
export function resolveSharedEntry(
  folders: string[],
  relPath: string
): { rootPath: string; innerRelPath: string } | null {
  const segments = (relPath ?? '').split('/').filter(Boolean)
  const rootLabel = segments[0]
  if (!rootLabel) return null
  const match = computeFolderLabels(folders).find((f) => f.label === rootLabel)
  if (!match) return null
  return { rootPath: match.path, innerRelPath: segments.slice(1).join('/') }
}

/** 複数の共有フォルダをまたいだブラウズ。relPathが空ならルート直下の共有フォルダ一覧を返す */
export function browseShared(folders: string[], relPath: string): BrowseEntry[] {
  if (!relPath) return listSharedRoots(folders)
  const resolved = resolveSharedEntry(folders, relPath)
  if (!resolved) throw new Error('invalid path')
  return listDirectory(resolved.rootPath, resolved.innerRelPath)
}
