// 保存先パスの解決・一時ファイル管理（Electron非依存、fs/pathのみ使用）
import fs from 'node:fs'
import path from 'node:path'

const TEMP_DIR_NAME = '.landrop-tmp'

export function tempDirFor(saveFolder: string): string {
  return path.join(saveFolder, TEMP_DIR_NAME)
}

export function ensureTempDir(saveFolder: string): string {
  const dir = tempDirFor(saveFolder)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function tempFilePath(saveFolder: string, transferId: string, fileId: string): string {
  return path.join(tempDirFor(saveFolder), `${transferId}-${fileId}.part`)
}

/** saveFolder直下でfileNameと衝突しない最終パスを決める（"name (1).ext"方式） */
export function resolveUniquePath(saveFolder: string, fileName: string): string {
  const ext = path.extname(fileName)
  const base = fileName.slice(0, fileName.length - ext.length)

  let candidate = path.join(saveFolder, fileName)
  let n = 1
  while (fs.existsSync(candidate)) {
    candidate = path.join(saveFolder, `${base} (${n})${ext}`)
    n += 1
  }
  return candidate
}
