// 共有フォルダ参照・アップロード/ダウンロード・フォルダ作成・リネームのHTTPクライアント（Electron非依存）
import http from 'node:http'
import fs from 'node:fs'
import type { BrowseEntry, ChatMessage, SyncManifest } from '../shared/types'

function getJson<T>(address: string, port: number, path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: address, port, path, method: 'GET' }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T)
          } catch (err) {
            reject(err)
          }
        } else {
          reject(new Error(`unexpected status ${res.statusCode}`))
        }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

function postJson(address: string, port: number, path: string, body: unknown): Promise<void> {
  return postJsonWithResponse(address, port, path, body).then(() => undefined)
}

function postJsonWithResponse<T>(address: string, port: number, path: string, body: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body), 'utf-8')
    const req = http.request(
      {
        host: address,
        port,
        path,
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': payload.length }
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T)
            } catch (err) {
              reject(err)
            }
          } else {
            reject(new Error(`unexpected status ${res.statusCode}`))
          }
        })
      }
    )
    req.on('error', reject)
    req.end(payload)
  })
}

export async function browseFolder(address: string, port: number, relPath: string): Promise<BrowseEntry[]> {
  const result = await getJson<{ ok: boolean; entries: BrowseEntry[] }>(
    address,
    port,
    `/api/browse?path=${encodeURIComponent(relPath)}`
  )
  return result.entries
}

export function createFolderRemote(address: string, port: number, relPath: string, name: string): Promise<void> {
  return postJson(address, port, '/api/mkdir', { path: relPath, name })
}

export function sendChatMessage(address: string, port: number, message: ChatMessage): Promise<void> {
  return postJson(address, port, '/api/chat', message)
}

export function renameEntryRemote(
  address: string,
  port: number,
  relPath: string,
  oldName: string,
  newName: string
): Promise<void> {
  return postJson(address, port, '/api/rename', { path: relPath, oldName, newName })
}

/** 相手PC自身の共有フォルダ内で、エントリを別フォルダへコピー/移動してもらう(貼り付け用) */
export function pasteRemote(
  address: string,
  port: number,
  srcRelPath: string,
  name: string,
  destRelPath: string,
  mode: 'copy' | 'move'
): Promise<{ ok: boolean; name: string }> {
  return postJsonWithResponse(address, port, '/api/paste', { srcPath: srcRelPath, name, destPath: destRelPath, mode })
}

/** 相手PC自身の共有フォルダ内のエントリを、相手のOSのごみ箱へ移動してもらう */
export function trashRemote(address: string, port: number, relPath: string, name: string): Promise<void> {
  return postJson(address, port, '/api/trash', { path: relPath, name })
}

/** 相手PC自身の共有フォルダ内で、選択したエントリを同じ場所にzipとしてまとめてもらう */
export function compressRemote(
  address: string,
  port: number,
  relPath: string,
  names: string[]
): Promise<{ ok: boolean; name: string }> {
  return postJsonWithResponse(address, port, '/api/compress', { path: relPath, names })
}

/** 相手PC自身の共有フォルダ内で、zipファイルを同じ場所に展開してもらう */
export function extractRemote(
  address: string,
  port: number,
  relPath: string,
  name: string
): Promise<{ ok: boolean; name: string }> {
  return postJsonWithResponse(address, port, '/api/extract', { path: relPath, name })
}

/** 相手PC自身の共有フォルダ内のエントリに、Finderカラータグを設定してもらう(相手がMacの場合のみ有効) */
export function setFinderTagColorRemote(
  address: string,
  port: number,
  relPath: string,
  name: string,
  colorHex: string | null
): Promise<{ ok: boolean }> {
  return postJsonWithResponse(address, port, '/api/finder-tag', { path: relPath, name, colorHex })
}

/** 相手PC自身の共有フォルダ内の指定フォルダを再帰的に一覧してもらう(フォルダ同期の差分比較用) */
export function getSyncManifestRemote(address: string, port: number, folder: string): Promise<SyncManifest> {
  return getJson<SyncManifest>(address, port, `/api/sync/manifest?folder=${encodeURIComponent(folder)}`)
}

function postFile(params: {
  address: string
  port: number
  path: string
  contentType: string
  filePath: string
  size: number
  onProgress?: (transferredBytes: number) => void
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: params.address,
        port: params.port,
        path: params.path,
        method: 'POST',
        headers: { 'content-type': params.contentType, 'content-length': params.size }
      },
      (res) => {
        res.resume()
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve()
        } else {
          reject(new Error(`unexpected status ${res.statusCode}`))
        }
      }
    )
    req.on('error', reject)

    const readStream = fs.createReadStream(params.filePath)
    let sent = 0
    readStream.on('data', (chunk: Buffer | string) => {
      sent += Buffer.byteLength(chunk)
      params.onProgress?.(sent)
    })
    readStream.on('error', reject)
    readStream.pipe(req)
  })
}

export function uploadFile(params: {
  address: string
  port: number
  relPath: string
  name: string
  filePath: string
  size: number
  onProgress?: (transferredBytes: number) => void
}): Promise<void> {
  const query = `path=${encodeURIComponent(params.relPath)}&name=${encodeURIComponent(params.name)}`
  return postFile({
    address: params.address,
    port: params.port,
    path: `/api/upload?${query}`,
    contentType: 'application/octet-stream',
    filePath: params.filePath,
    size: params.size,
    onProgress: params.onProgress
  })
}

/** 複数のファイル/フォルダをまとめたzipを送り、サーバー側で展開して配置してもらう */
export function uploadZip(params: {
  address: string
  port: number
  relPath: string
  zipFilePath: string
  size: number
  onProgress?: (transferredBytes: number) => void
}): Promise<void> {
  return postFile({
    address: params.address,
    port: params.port,
    path: `/api/upload-zip?path=${encodeURIComponent(params.relPath)}`,
    contentType: 'application/zip',
    filePath: params.zipFilePath,
    size: params.size,
    onProgress: params.onProgress
  })
}

function getToFile(params: {
  address: string
  port: number
  path: string
  destPath: string
  onProgress?: (transferredBytes: number, totalBytes: number) => void
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: params.address, port: params.port, path: params.path, method: 'GET' }, (res) => {
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        res.resume()
        reject(new Error(`unexpected status ${res.statusCode}`))
        return
      }
      const total = Number(res.headers['content-length'] ?? 0)
      const writeStream = fs.createWriteStream(params.destPath)
      let received = 0
      res.on('data', (chunk: Buffer) => {
        received += chunk.length
        params.onProgress?.(received, total)
      })
      res.on('error', (err) => {
        writeStream.destroy()
        reject(err)
      })
      writeStream.on('error', reject)
      writeStream.on('finish', resolve)
      res.pipe(writeStream)
    })
    req.on('error', reject)
    req.end()
  })
}

export function downloadFile(params: {
  address: string
  port: number
  relPath: string
  destPath: string
  onProgress?: (transferredBytes: number, totalBytes: number) => void
}): Promise<void> {
  return getToFile({
    address: params.address,
    port: params.port,
    path: `/api/download?path=${encodeURIComponent(params.relPath)}`,
    destPath: params.destPath,
    onProgress: params.onProgress
  })
}

/** 複数のファイル/フォルダをまとめてzipとしてダウンロードする */
export function downloadZip(params: {
  address: string
  port: number
  relPaths: string[]
  destPath: string
  onProgress?: (transferredBytes: number, totalBytes: number) => void
}): Promise<void> {
  const query = params.relPaths.map((p) => `path=${encodeURIComponent(p)}`).join('&')
  return getToFile({
    address: params.address,
    port: params.port,
    path: `/api/download-zip?${query}`,
    destPath: params.destPath,
    onProgress: params.onProgress
  })
}
