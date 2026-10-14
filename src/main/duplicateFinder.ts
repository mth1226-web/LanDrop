import { createHash } from 'crypto'
import { createReadStream, type Dirent } from 'fs'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type {
  DuplicateFileGroup,
  DuplicateFolderGroup,
  DuplicateScanProgress,
  DuplicateScanResult,
  DuplicateSimilarFolderPair
} from '../shared/types'

interface WalkedFile {
  /** 走査対象群全体を1本の仮想的な木とみなした場合の相対パス。区切りは常に'/' */
  relPath: string
  absPath: string
  size: number
}

interface WalkedDir {
  /** 走査対象群全体を1本の仮想的な木とみなした場合の相対パス。区切りは常に'/' */
  relPath: string
  absPath: string
}

const PROGRESS_THROTTLE_MS = 150
// クラウド同期ドライブ(Google Drive/OneDrive等)の「オンラインのみ」ファイルは、読み込み時にダウンロードが
// 走って無期限に待たされることがあるため、1ファイルあたりの読み込みに上限を設けてスキップできるようにする
const HASH_TIMEOUT_MS = 30000
const SIMILAR_FOLDER_MIN_PERCENT = 50

async function hashFile(absPath: string): Promise<string> {
  const hash = createHash('sha256')
  const stream = createReadStream(absPath)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      (async () => {
        for await (const chunk of stream) hash.update(chunk as Buffer)
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`読み込みがタイムアウトしました: ${absPath}`)), HASH_TIMEOUT_MS)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
    if (!stream.destroyed) stream.destroy()
  }
  return hash.digest('hex')
}

/**
 * rootPath配下を再帰的に列挙する。relPrefixは複数ルートを1本の仮想的な木にまとめる際の先頭セグメント
 * (単一ルートなら''でよい)。シンボリックリンクは循環を避けるため辿らない。読み取り不可のエントリはスキップしてカウントする
 */
async function walk(
  rootPath: string,
  relPrefix: string,
  isCancelled: () => boolean,
  onFile: (f: WalkedFile) => void
): Promise<{ dirs: WalkedDir[]; errorCount: number }> {
  const dirs: WalkedDir[] = []
  let errorCount = 0

  async function walkDir(absDir: string, relDir: string): Promise<void> {
    if (isCancelled()) return
    let entries: Dirent[]
    try {
      entries = await readdir(absDir, { withFileTypes: true })
    } catch {
      errorCount++
      return
    }
    dirs.push({ relPath: relDir, absPath: absDir })
    for (const entry of entries) {
      if (isCancelled()) return
      if (entry.isSymbolicLink()) continue
      const absPath = join(absDir, entry.name)
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await walkDir(absPath, relPath)
      } else if (entry.isFile()) {
        try {
          const st = await stat(absPath)
          onFile({ relPath, absPath, size: st.size })
        } catch {
          errorCount++
        }
      }
    }
  }

  await walkDir(rootPath, relPrefix)
  return { dirs, errorCount }
}

function parentRelPath(relPath: string): string {
  const i = relPath.lastIndexOf('/')
  return i === -1 ? '' : relPath.slice(0, i)
}

function isAncestorOrSame(maybeAncestor: string, relPath: string): boolean {
  return relPath === maybeAncestor || relPath.startsWith(`${maybeAncestor}/`)
}

export async function scanForDuplicates(
  rootPaths: string[],
  onProgress: (progress: DuplicateScanProgress) => void,
  isCancelled: () => boolean
): Promise<DuplicateScanResult> {
  // 複数のフォルダ/ドライブをまたいで探すため、各ルートを仮想的な最上位フォルダ(#root0, #root1, ...)として
  // 1本の木にまとめる(1つだけの場合は従来通りルート自身をrelPath=''として扱う)
  const useVirtualPrefix = rootPaths.length > 1
  const files: WalkedFile[] = []
  const dirs: WalkedDir[] = []
  let walkErrorCount = 0
  let lastEmit = 0

  for (let rootIndex = 0; rootIndex < rootPaths.length; rootIndex++) {
    if (isCancelled()) break
    const prefix = useVirtualPrefix ? `#root${rootIndex}` : ''
    const { dirs: rootDirs, errorCount } = await walk(rootPaths[rootIndex], prefix, isCancelled, (f) => {
      files.push(f)
      const now = Date.now()
      if (now - lastEmit >= PROGRESS_THROTTLE_MS) {
        lastEmit = now
        onProgress({ phase: 'walking', filesWalked: files.length, filesToHash: 0, filesHashed: 0, currentPath: f.relPath })
      }
    })
    dirs.push(...rootDirs)
    walkErrorCount += errorCount
  }

  if (isCancelled()) {
    return { rootPaths, folderGroups: [], fileGroups: [], similarFolderPairs: [], errorCount: walkErrorCount, cancelled: true }
  }

  // 同じサイズのファイルが2件以上ある場合だけハッシュを計算する(サイズがユニークなファイルは絶対に重複しえないため)
  const bySize = new Map<number, WalkedFile[]>()
  for (const f of files) {
    const arr = bySize.get(f.size)
    if (arr) arr.push(f)
    else bySize.set(f.size, [f])
  }
  const candidates: WalkedFile[] = []
  for (const arr of bySize.values()) {
    if (arr.length >= 2) candidates.push(...arr)
  }

  const hashByAbsPath = new Map<string, string>()
  let hashErrorCount = 0
  lastEmit = 0
  for (let i = 0; i < candidates.length; i++) {
    if (isCancelled()) {
      return {
        rootPaths,
        folderGroups: [],
        fileGroups: [],
        similarFolderPairs: [],
        errorCount: walkErrorCount + hashErrorCount,
        cancelled: true
      }
    }
    const f = candidates[i]
    try {
      hashByAbsPath.set(f.absPath, await hashFile(f.absPath))
    } catch {
      hashErrorCount++
    }
    const now = Date.now()
    if (now - lastEmit >= PROGRESS_THROTTLE_MS || i === candidates.length - 1) {
      lastEmit = now
      onProgress({
        phase: 'hashing',
        filesWalked: files.length,
        filesToHash: candidates.length,
        filesHashed: i + 1,
        currentPath: f.relPath
      })
    }
  }

  onProgress({ phase: 'comparing', filesWalked: files.length, filesToHash: candidates.length, filesHashed: candidates.length, currentPath: '' })

  // ファイル単位の重複グループ(サイズ+ハッシュが完全一致するもの)
  const byHash = new Map<string, WalkedFile[]>()
  for (const f of candidates) {
    const hash = hashByAbsPath.get(f.absPath)
    if (!hash) continue
    const key = `${f.size}:${hash}`
    const arr = byHash.get(key)
    if (arr) arr.push(f)
    else byHash.set(key, [f])
  }
  const rawFileGroups = Array.from(byHash.values()).filter((arr) => arr.length >= 2)

  // フォルダ単位の重複判定: 配下のファイルを再帰的に集約し、深い方から親へ積み上げる(全ディレクトリ×全ファイルの総当りを避けるため)。
  // 配下にハッシュ未計算のファイル(=サイズがユニーク)が1つでもあるフォルダは、他のどのフォルダとも一致しえないため対象から除外する
  const absPathByDirRelPath = new Map(dirs.map((d) => [d.relPath, d.absPath]))
  const directFilesByDir = new Map<string, WalkedFile[]>()
  for (const f of files) {
    const dir = parentRelPath(f.relPath)
    const arr = directFilesByDir.get(dir)
    if (arr) arr.push(f)
    else directFilesByDir.set(dir, [f])
  }
  const childDirsByParent = new Map<string, string[]>()
  for (const d of dirs) {
    if (!useVirtualPrefix && d.relPath === '') continue
    const parent = parentRelPath(d.relPath)
    const arr = childDirsByParent.get(parent)
    if (arr) arr.push(d.relPath)
    else childDirsByParent.set(parent, [d.relPath])
  }

  const filesUnderDir = new Map<string, WalkedFile[]>()
  const hasUnhashedUnderDir = new Map<string, boolean>()
  const dirsByDepthDesc = [...dirs].sort((a, b) => b.relPath.split('/').length - a.relPath.split('/').length)
  for (const d of dirsByDepthDesc) {
    const direct = directFilesByDir.get(d.relPath) ?? []
    let hasUnhashed = direct.some((f) => !hashByAbsPath.has(f.absPath))
    const under: WalkedFile[] = [...direct]
    for (const childRel of childDirsByParent.get(d.relPath) ?? []) {
      under.push(...(filesUnderDir.get(childRel) ?? []))
      if (hasUnhashedUnderDir.get(childRel)) hasUnhashed = true
    }
    filesUnderDir.set(d.relPath, under)
    hasUnhashedUnderDir.set(d.relPath, hasUnhashed)
  }

  const bySignature = new Map<string, string[]>()
  for (const d of dirs) {
    const under = filesUnderDir.get(d.relPath) ?? []
    if (under.length === 0 || hasUnhashedUnderDir.get(d.relPath)) continue
    const prefix = d.relPath ? `${d.relPath}/` : ''
    const parts = under
      .map((f) => `${f.relPath.slice(prefix.length)}::${hashByAbsPath.get(f.absPath)}`)
      .sort()
    const signature = createHash('sha256').update(parts.join('\n')).digest('hex')
    const key = `${under.length}:${signature}`
    const arr = bySignature.get(key)
    if (arr) arr.push(d.relPath)
    else bySignature.set(key, [d.relPath])
  }
  const rawFolderGroups = Array.from(bySignature.entries())
    .map(([key, relPaths]) => ({ relPaths, fileCount: Number(key.split(':')[0]) }))
    .filter((g) => g.relPaths.length >= 2)

  // 親フォルダ自体が既に重複と判定されている場合、その配下のサブフォルダは重複として個別に出さない(冗長なため)
  const matchedDirRelPaths = new Set(rawFolderGroups.flatMap((g) => g.relPaths))
  const folderGroups: DuplicateFolderGroup[] = []
  const leafFolderRelPaths: string[] = []
  for (const g of rawFolderGroups) {
    const kept = g.relPaths.filter((relPath) => !matchedDirRelPaths.has(parentRelPath(relPath)))
    if (kept.length < 2) continue
    leafFolderRelPaths.push(...kept)
    const totalSize = (filesUnderDir.get(kept[0]) ?? []).reduce((sum, f) => sum + f.size, 0)
    folderGroups.push({
      id: randomUUID(),
      fileCount: g.fileCount,
      totalSize,
      paths: kept.map((relPath) => absPathByDirRelPath.get(relPath)!)
    })
  }

  // 「似ているフォルダ」判定: 完全一致した葉フォルダ(leafFolderRelPaths)の1つ上の階層同士を比較し、
  // 中身の何%が一致するかを見る。「別の場所に似た構成のフォルダがある」ケースに気づけるようにするため。
  // ルートを複数指定している場合は、各ルート自身(#root0等)は比較対象から除く(異なるドライブ丸ごとの比較は無意味なため)
  const candidateParentRelPaths = Array.from(
    new Set(
      leafFolderRelPaths
        .map(parentRelPath)
        .filter((p) => p !== '' && !(useVirtualPrefix && !p.includes('/')))
    )
  )
  const parentFileKeys = new Map<string, Set<string>>()
  const parentFileCounts = new Map<string, number>()
  for (const parentRel of candidateParentRelPaths) {
    const under = filesUnderDir.get(parentRel) ?? []
    const prefix = parentRel ? `${parentRel}/` : ''
    const keys = new Set<string>()
    for (const f of under) {
      const hash = hashByAbsPath.get(f.absPath)
      if (hash) keys.add(`${f.relPath.slice(prefix.length)}::${hash}`)
    }
    parentFileKeys.set(parentRel, keys)
    parentFileCounts.set(parentRel, under.length)
  }
  const similarFolderPairs: DuplicateSimilarFolderPair[] = []
  for (let i = 0; i < candidateParentRelPaths.length; i++) {
    for (let j = i + 1; j < candidateParentRelPaths.length; j++) {
      const relA = candidateParentRelPaths[i]
      const relB = candidateParentRelPaths[j]
      if (isAncestorOrSame(relA, relB) || isAncestorOrSame(relB, relA)) continue
      const totalA = parentFileCounts.get(relA) ?? 0
      const totalB = parentFileCounts.get(relB) ?? 0
      if (totalA === 0 || totalB === 0) continue
      const keysA = parentFileKeys.get(relA)!
      const keysB = parentFileKeys.get(relB)!
      let matched = 0
      for (const key of keysA) {
        if (keysB.has(key)) matched++
      }
      if (matched === 0) continue
      const percent = Math.round((matched / Math.max(totalA, totalB)) * 100)
      // 完全一致(100%)はここには来ない設計だが、念のため重複フォルダ側と被らないよう除外する
      if (percent < SIMILAR_FOLDER_MIN_PERCENT || percent >= 100) continue
      similarFolderPairs.push({
        id: randomUUID(),
        pathA: absPathByDirRelPath.get(relA)!,
        pathB: absPathByDirRelPath.get(relB)!,
        matchedFileCount: matched,
        totalFileCountA: totalA,
        totalFileCountB: totalB,
        similarityPercent: percent
      })
    }
  }
  similarFolderPairs.sort((a, b) => b.similarityPercent - a.similarityPercent)

  // 既に重複フォルダとして報告済みの配下にあるファイルは、ファイル単位でも重複表示すると冗長なので除外する
  function isUnderReportedFolder(relPath: string): boolean {
    return leafFolderRelPaths.some((dir) => relPath.startsWith(`${dir}/`))
  }
  const fileGroups: DuplicateFileGroup[] = rawFileGroups
    .map((arr) => ({
      id: randomUUID(),
      size: arr[0].size,
      paths: arr.filter((f) => !isUnderReportedFolder(f.relPath)).map((f) => f.absPath)
    }))
    .filter((g) => g.paths.length >= 2)

  return {
    rootPaths,
    folderGroups,
    fileGroups,
    similarFolderPairs,
    errorCount: walkErrorCount + hashErrorCount,
    cancelled: false
  }
}
