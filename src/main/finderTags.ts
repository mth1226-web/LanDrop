// macOS Finderのカラータグ(色ラベル)の読み書き（Electron非依存、child_processのみ使用）
// com.apple.metadata:_kMDItemUserTags という拡張属性にバイナリplist(文字列の配列)として保存され、
// 色は各タグ文字列の末尾に "\n<1〜7>" という数字が付く形で表現される(タグ名部分は空文字列でもよい)。
// 数字→色の対応は一般に知られている実装例を参考にした値で、実機での見た目確認はまだできていない。
import { execFileSync } from 'node:child_process'
import bplistParser from 'bplist-parser'
import bplistCreator from 'bplist-creator'
import { FINDER_TAG_COLORS } from '../shared/types'

const TAG_ATTRIBUTE = 'com.apple.metadata:_kMDItemUserTags'

function colorIndexFromHex(hex: string): number | null {
  const normalized = hex.toLowerCase()
  for (const [index, value] of Object.entries(FINDER_TAG_COLORS)) {
    if (value.toLowerCase() === normalized) return Number(index)
  }
  return null
}

/** 指定したファイル/フォルダのFinderカラータグの色(16進)を読む。タグが無い/Mac以外ならnull */
export function readFinderTagColor(absPath: string): string | null {
  if (process.platform !== 'darwin') return null
  let hex: string
  try {
    hex = execFileSync('xattr', ['-p', TAG_ATTRIBUTE, absPath], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    // 属性自体が無いファイルは正常系としてここに来る
    return null
  }
  if (!hex) return null
  try {
    const buffer = Buffer.from(hex, 'hex')
    const [tags] = bplistParser.parseBuffer<string[]>(buffer)
    for (const tag of tags) {
      const match = /\n([1-7])$/.exec(tag)
      if (match) {
        const color = FINDER_TAG_COLORS[Number(match[1])]
        if (color) return color
      }
    }
  } catch {
    // plistの解析に失敗した場合は色無し扱いにする
  }
  return null
}

/** 指定したファイル/フォルダのFinderカラータグを設定する。colorHexがnullならタグを外す */
export function writeFinderTagColor(absPath: string, colorHex: string | null): void {
  if (process.platform !== 'darwin') throw new Error('この機能はMacのみ対応しています')
  if (colorHex === null) {
    try {
      execFileSync('xattr', ['-d', TAG_ATTRIBUTE, absPath], { stdio: 'ignore' })
    } catch {
      // 元々タグが無かった場合はこれでよい
    }
    return
  }
  const index = colorIndexFromHex(colorHex)
  if (!index) throw new Error('invalid-color')
  // bplist-creatorは長さ1の配列を「複数ドキュメントのうちの1件」とみなして中身を展開してしまうため、
  // 配列そのものをplistのルートにしたい場合はもう1段配列で包む必要がある
  const plistBuffer = bplistCreator([[`\n${index}`]])
  execFileSync('xattr', ['-wx', TAG_ATTRIBUTE, plistBuffer.toString('hex'), absPath])
}
