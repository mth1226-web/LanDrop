// 共有フォルダの参照・アップロード/ダウンロード・フォルダ作成・リネームを提供するHTTPサーバー
// （Electron非依存、http/fsのみ使用）
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import archiver from 'archiver'
import extractZip from 'extract-zip'
import {
  browseShared,
  resolveSharedEntry,
  resolveSafePath,
  createFolder,
  renameEntry,
  isValidEntryName,
  copyEntry,
  moveEntry,
  compressEntries,
  extractZipEntry,
  setEntryFinderTagColor,
  listDirectoryRecursive
} from './sharedFs'
import { resolveUniquePath } from './fileSave'
import { renderWebUiHtml } from './webUi'
import { guessMimeType } from './mimeType'
import type { BrowseEntry, ChatMessage } from '../shared/types'

const JSON_BODY_LIMIT_BYTES = 1_000_000

export interface UploadReceivedPayload {
  fromAddress: string
  relPath: string
  fileName: string
  size: number
}

export declare interface HttpServer {
  on(event: 'upload-received', listener: (payload: UploadReceivedPayload) => void): this
  on(event: 'chat-received', listener: (message: ChatMessage) => void): this
  emit(event: 'upload-received', payload: UploadReceivedPayload): boolean
  emit(event: 'chat-received', message: ChatMessage): boolean
}

export class HttpServer extends EventEmitter {
  private readonly server: http.Server
  private readonly getSharedFolders: () => string[]
  private readonly getDeviceName: () => string
  private readonly trashPath: (absPath: string) => Promise<void>

  constructor(options: {
    getSharedFolders: () => string[]
    getDeviceName: () => string
    trashPath: (absPath: string) => Promise<void>
  }) {
    super()
    this.getSharedFolders = options.getSharedFolders
    this.getDeviceName = options.getDeviceName
    this.trashPath = options.trashPath
    this.server = http.createServer((req, res) => this.handleRequest(req, res))
  }

  /** listen(0)でOSにポートを割り当てさせ、実ポート番号を返す */
  start(port = 0): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(port, () => {
        this.server.removeListener('error', reject)
        const address = this.server.address()
        if (address === null || typeof address === 'string') {
          reject(new Error('failed to determine assigned port'))
          return
        }
        resolve(address.port)
      })
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()))
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url ?? '/', 'http://localhost')
    try {
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        return this.handleWebUi(res)
      }
      if (req.method === 'GET' && url.pathname === '/api/browse') return this.handleBrowse(res, url)
      if (req.method === 'GET' && url.pathname === '/api/sync/manifest') return this.handleSyncManifest(res, url)
      if (req.method === 'GET' && url.pathname === '/api/download') return this.handleDownload(res, url)
      if (req.method === 'GET' && url.pathname === '/api/download-zip') return this.handleDownloadZip(res, url)
      if (req.method === 'POST' && url.pathname === '/api/upload') return void this.handleUpload(req, res, url)
      if (req.method === 'POST' && url.pathname === '/api/upload-zip') return void this.handleUploadZip(req, res, url)
      if (req.method === 'POST' && url.pathname === '/api/mkdir') return void this.handleMkdir(req, res, url)
      if (req.method === 'POST' && url.pathname === '/api/rename') return void this.handleRename(req, res, url)
      if (req.method === 'POST' && url.pathname === '/api/paste') return void this.handlePaste(req, res, url)
      if (req.method === 'POST' && url.pathname === '/api/trash') return void this.handleTrash(req, res, url)
      if (req.method === 'POST' && url.pathname === '/api/compress') return void this.handleCompress(req, res, url)
      if (req.method === 'POST' && url.pathname === '/api/extract') return void this.handleExtract(req, res, url)
      if (req.method === 'POST' && url.pathname === '/api/finder-tag') return void this.handleFinderTag(req, res, url)
      if (req.method === 'POST' && url.pathname === '/api/chat') return void this.handleChat(req, res)
    } catch (err) {
      this.sendJson(res, 500, { ok: false, error: String(err) })
      return
    }
    res.writeHead(404)
    res.end()
  }

  private sendJson(res: http.ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  private readJsonBody<T>(req: http.IncomingMessage, limitBytes: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      let total = 0
      req.on('data', (chunk: Buffer) => {
        total += chunk.length
        if (total > limitBytes) {
          reject(new Error('body too large'))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T)
        } catch (err) {
          reject(err)
        }
      })
      req.on('error', reject)
    })
  }

  private handleWebUi(res: http.ServerResponse): void {
    const html = renderWebUiHtml(this.getDeviceName())
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(html)
  }

  private handleBrowse(res: http.ServerResponse, url: URL): void {
    const relPath = url.searchParams.get('path') ?? ''
    let entries: BrowseEntry[]
    try {
      entries = browseShared(this.getSharedFolders(), relPath)
    } catch {
      this.sendJson(res, 400, { ok: false, error: 'invalid-path' })
      return
    }
    this.sendJson(res, 200, { ok: true, entries })
  }

  /** フォルダ同期の差分比較用: 指定した共有フォルダ配下を再帰的に一覧してSyncManifestとして返す */
  private handleSyncManifest(res: http.ServerResponse, url: URL): void {
    const folder = url.searchParams.get('folder') ?? ''
    const resolved = resolveSharedEntry(this.getSharedFolders(), folder)
    if (!resolved) {
      this.sendJson(res, 400, { ok: false, error: 'invalid-folder' })
      return
    }
    try {
      const entries = listDirectoryRecursive(resolved.rootPath, resolved.innerRelPath)
      this.sendJson(res, 200, { rootKey: `remote:${folder}`, generatedAt: Date.now(), entries })
    } catch (err) {
      this.sendJson(res, 400, { ok: false, error: String(err) })
    }
  }

  private handleDownload(res: http.ServerResponse, url: URL): void {
    const relPath = url.searchParams.get('path') ?? ''
    const resolved = resolveSharedEntry(this.getSharedFolders(), relPath)
    const target = resolved ? resolveSafePath(resolved.rootPath, resolved.innerRelPath) : null
    if (!target || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      res.writeHead(404)
      res.end()
      return
    }
    const stat = fs.statSync(target)
    const fileName = path.basename(target)
    // inline=1 はプレビュー表示用。ブラウザ内蔵ビューア(画像/動画/音声/PDF)を起動させるため
    // ダウンロード時のoctet-stream+attachmentとは別に、拡張子に応じたMIME型とinline表示を返す
    const isInline = url.searchParams.get('inline') === '1'
    res.writeHead(200, {
      'content-type': isInline ? guessMimeType(fileName) : 'application/octet-stream',
      'content-length': stat.size,
      'content-disposition': `${isInline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName)}`
    })
    fs.createReadStream(target).pipe(res)
  }

  /** 複数のファイル/フォルダをまとめてzipでダウンロードする(フォルダ単位・複数選択ダウンロード用) */
  private handleDownloadZip(res: http.ServerResponse, url: URL): void {
    const relPaths = url.searchParams.getAll('path')
    if (relPaths.length === 0) {
      res.writeHead(400)
      res.end()
      return
    }

    const targets: { absPath: string; arcName: string; isDirectory: boolean }[] = []
    for (const relPath of relPaths) {
      const resolved = resolveSharedEntry(this.getSharedFolders(), relPath)
      const absPath = resolved ? resolveSafePath(resolved.rootPath, resolved.innerRelPath) : null
      if (!absPath || !fs.existsSync(absPath)) {
        res.writeHead(404)
        res.end()
        return
      }
      targets.push({ absPath, arcName: path.basename(absPath), isDirectory: fs.statSync(absPath).isDirectory() })
    }

    const zipName = targets.length === 1 ? `${targets[0].arcName}.zip` : 'LanDrop-download.zip'
    res.writeHead(200, {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`
    })

    const archive = archiver('zip', { zlib: { level: 6 } })
    archive.on('error', () => res.destroy())
    archive.pipe(res)
    for (const target of targets) {
      if (target.isDirectory) {
        archive.directory(target.absPath, target.arcName)
      } else {
        archive.file(target.absPath, { name: target.arcName })
      }
    }
    void archive.finalize()
  }

  private async handleUpload(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
    const relPath = url.searchParams.get('path') ?? ''
    const name = url.searchParams.get('name') ?? ''
    const resolved = resolveSharedEntry(this.getSharedFolders(), relPath)
    const dir = resolved ? resolveSafePath(resolved.rootPath, resolved.innerRelPath) : null
    if (!dir || !fs.existsSync(dir) || !name || !isValidEntryName(name)) {
      this.sendJson(res, 400, { ok: false, error: 'invalid-request' })
      return
    }

    const finalPath = resolveUniquePath(dir, name)
    const tempPath = `${finalPath}.uploading`
    const writeStream = fs.createWriteStream(tempPath)

    req.on('error', () => {
      writeStream.destroy()
      fs.rm(tempPath, { force: true }, () => {})
      if (!res.headersSent) this.sendJson(res, 500, { ok: false, error: 'upload-failed' })
    })

    req.pipe(writeStream)

    writeStream.on('finish', () => {
      fs.rename(tempPath, finalPath, (err) => {
        if (err) {
          this.sendJson(res, 500, { ok: false, error: String(err) })
          return
        }
        this.sendJson(res, 200, { ok: true, name: path.basename(finalPath) })
        this.emit('upload-received', {
          fromAddress: req.socket.remoteAddress ?? '',
          relPath,
          fileName: path.basename(finalPath),
          size: fs.statSync(finalPath).size
        })
      })
    })
  }

  /** zipにまとめたファイル/フォルダをまとめて受け取り、展開して共有フォルダに配置する(フォルダ単位・複数選択アップロード用) */
  private async handleUploadZip(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
    const relPath = url.searchParams.get('path') ?? ''
    const resolved = resolveSharedEntry(this.getSharedFolders(), relPath)
    const dir = resolved ? resolveSafePath(resolved.rootPath, resolved.innerRelPath) : null
    if (!dir || !fs.existsSync(dir)) {
      this.sendJson(res, 400, { ok: false, error: 'invalid-request' })
      return
    }

    const tempZipPath = path.join(os.tmpdir(), `landrop-upload-${randomUUID()}.zip`)
    const writeStream = fs.createWriteStream(tempZipPath)

    req.on('error', () => {
      writeStream.destroy()
      fs.rm(tempZipPath, { force: true }, () => {})
      if (!res.headersSent) this.sendJson(res, 500, { ok: false, error: 'upload-failed' })
    })

    req.pipe(writeStream)

    writeStream.on('finish', async () => {
      const tempExtractDir = path.join(os.tmpdir(), `landrop-upload-extract-${randomUUID()}`)
      try {
        await extractZip(tempZipPath, { dir: tempExtractDir })
        for (const name of fs.readdirSync(tempExtractDir)) {
          const src = path.join(tempExtractDir, name)
          const dest = resolveUniquePath(dir, name)
          fs.cpSync(src, dest, { recursive: true })
        }
        this.sendJson(res, 200, { ok: true })
        this.emit('upload-received', { fromAddress: req.socket.remoteAddress ?? '', relPath, fileName: '', size: 0 })
      } catch (err) {
        this.sendJson(res, 500, { ok: false, error: String(err) })
      } finally {
        fs.rm(tempZipPath, { force: true }, () => {})
        fs.rm(tempExtractDir, { recursive: true, force: true }, () => {})
      }
    })
  }

  private async handleMkdir(req: http.IncomingMessage, res: http.ServerResponse, _url: URL): Promise<void> {
    let body: { path: string; name: string }
    try {
      body = await this.readJsonBody(req, JSON_BODY_LIMIT_BYTES)
      const resolved = resolveSharedEntry(this.getSharedFolders(), body.path)
      if (!resolved) throw new Error('invalid path')
      createFolder(resolved.rootPath, resolved.innerRelPath, body.name)
    } catch (err) {
      this.sendJson(res, 400, { ok: false, error: String(err) })
      return
    }
    this.sendJson(res, 200, { ok: true })
  }

  private async handleRename(req: http.IncomingMessage, res: http.ServerResponse, _url: URL): Promise<void> {
    let body: { path: string; oldName: string; newName: string }
    try {
      body = await this.readJsonBody(req, JSON_BODY_LIMIT_BYTES)
      const resolved = resolveSharedEntry(this.getSharedFolders(), body.path)
      if (!resolved) throw new Error('invalid path')
      renameEntry(resolved.rootPath, resolved.innerRelPath, body.oldName, body.newName)
    } catch (err) {
      this.sendJson(res, 400, { ok: false, error: String(err) })
      return
    }
    this.sendJson(res, 200, { ok: true })
  }

  /** 同じ端末の共有フォルダ内で、エントリを別フォルダへコピー/移動する(貼り付け機能) */
  private async handlePaste(req: http.IncomingMessage, res: http.ServerResponse, _url: URL): Promise<void> {
    let body: { srcPath: string; name: string; destPath: string; mode: 'copy' | 'move' }
    try {
      body = await this.readJsonBody(req, JSON_BODY_LIMIT_BYTES)
      const src = resolveSharedEntry(this.getSharedFolders(), body.srcPath)
      const dest = resolveSharedEntry(this.getSharedFolders(), body.destPath)
      if (!src || !dest) throw new Error('invalid path')
      const finalName =
        body.mode === 'move'
          ? moveEntry(src.rootPath, src.innerRelPath, body.name, dest.rootPath, dest.innerRelPath)
          : copyEntry(src.rootPath, src.innerRelPath, body.name, dest.rootPath, dest.innerRelPath)
      this.sendJson(res, 200, { ok: true, name: finalName })
    } catch (err) {
      this.sendJson(res, 400, { ok: false, error: String(err) })
    }
  }

  /** エントリをOSのごみ箱(Windowsのごみ箱/macOSのTrash)へ移動する */
  private async handleTrash(req: http.IncomingMessage, res: http.ServerResponse, _url: URL): Promise<void> {
    let body: { path: string; name: string }
    try {
      body = await this.readJsonBody(req, JSON_BODY_LIMIT_BYTES)
      const resolved = resolveSharedEntry(this.getSharedFolders(), body.path)
      const parent = resolved ? resolveSafePath(resolved.rootPath, resolved.innerRelPath) : null
      const target = parent ? path.join(parent, body.name) : null
      if (!target || !fs.existsSync(target)) throw new Error('not found')
      await this.trashPath(target)
      this.sendJson(res, 200, { ok: true })
    } catch (err) {
      this.sendJson(res, 400, { ok: false, error: String(err) })
    }
  }

  /** 選択したエントリを同じ場所にzipとしてまとめる(右クリック「圧縮」) */
  private async handleCompress(req: http.IncomingMessage, res: http.ServerResponse, _url: URL): Promise<void> {
    let body: { path: string; names: string[] }
    try {
      body = await this.readJsonBody(req, JSON_BODY_LIMIT_BYTES)
      const resolved = resolveSharedEntry(this.getSharedFolders(), body.path)
      if (!resolved) throw new Error('invalid path')
      const name = await compressEntries(resolved.rootPath, resolved.innerRelPath, body.names)
      this.sendJson(res, 200, { ok: true, name })
    } catch (err) {
      this.sendJson(res, 400, { ok: false, error: String(err) })
    }
  }

  /** zipファイルを同じ場所に展開する(右クリック「展開」) */
  private async handleExtract(req: http.IncomingMessage, res: http.ServerResponse, _url: URL): Promise<void> {
    let body: { path: string; name: string }
    try {
      body = await this.readJsonBody(req, JSON_BODY_LIMIT_BYTES)
      const resolved = resolveSharedEntry(this.getSharedFolders(), body.path)
      if (!resolved) throw new Error('invalid path')
      const name = await extractZipEntry(resolved.rootPath, resolved.innerRelPath, body.name)
      this.sendJson(res, 200, { ok: true, name })
    } catch (err) {
      this.sendJson(res, 400, { ok: false, error: String(err) })
    }
  }

  /** エントリのMac Finderカラータグを設定する(相手PC自身がMacの場合のみ有効) */
  private async handleFinderTag(req: http.IncomingMessage, res: http.ServerResponse, _url: URL): Promise<void> {
    let body: { path: string; name: string; colorHex: string | null }
    try {
      body = await this.readJsonBody(req, JSON_BODY_LIMIT_BYTES)
      const resolved = resolveSharedEntry(this.getSharedFolders(), body.path)
      if (!resolved) throw new Error('invalid path')
      setEntryFinderTagColor(resolved.rootPath, resolved.innerRelPath, body.name, body.colorHex)
      this.sendJson(res, 200, { ok: true })
    } catch (err) {
      this.sendJson(res, 400, { ok: false, error: String(err) })
    }
  }

  private async handleChat(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body: ChatMessage
    try {
      body = await this.readJsonBody(req, JSON_BODY_LIMIT_BYTES)
      if (
        typeof body.id !== 'string' ||
        typeof body.fromDeviceId !== 'string' ||
        typeof body.fromDeviceName !== 'string' ||
        typeof body.text !== 'string' ||
        typeof body.timestamp !== 'number'
      ) {
        throw new Error('invalid chat message')
      }
    } catch (err) {
      this.sendJson(res, 400, { ok: false, error: String(err) })
      return
    }
    this.sendJson(res, 200, { ok: true })
    this.emit('chat-received', body)
  }
}
