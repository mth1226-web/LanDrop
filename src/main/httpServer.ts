// 共有フォルダの参照・アップロード/ダウンロード・フォルダ作成・リネームを提供するHTTPサーバー
// （Electron非依存、http/fsのみ使用）
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { listDirectory, createFolder, renameEntry, resolveSafePath, isValidEntryName } from './sharedFs'
import { resolveUniquePath } from './fileSave'
import type { BrowseEntry } from '../shared/types'

const JSON_BODY_LIMIT_BYTES = 1_000_000

export interface UploadReceivedPayload {
  fromAddress: string
  relPath: string
  fileName: string
  size: number
}

export declare interface HttpServer {
  on(event: 'upload-received', listener: (payload: UploadReceivedPayload) => void): this
  emit(event: 'upload-received', payload: UploadReceivedPayload): boolean
}

export class HttpServer extends EventEmitter {
  private readonly server: http.Server
  private readonly getSharedFolder: () => string

  constructor(options: { getSharedFolder: () => string }) {
    super()
    this.getSharedFolder = options.getSharedFolder
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
      if (req.method === 'GET' && url.pathname === '/api/browse') return this.handleBrowse(res, url)
      if (req.method === 'GET' && url.pathname === '/api/download') return this.handleDownload(res, url)
      if (req.method === 'POST' && url.pathname === '/api/upload') return void this.handleUpload(req, res, url)
      if (req.method === 'POST' && url.pathname === '/api/mkdir') return void this.handleMkdir(req, res, url)
      if (req.method === 'POST' && url.pathname === '/api/rename') return void this.handleRename(req, res, url)
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

  private handleBrowse(res: http.ServerResponse, url: URL): void {
    const relPath = url.searchParams.get('path') ?? ''
    let entries: BrowseEntry[]
    try {
      entries = listDirectory(this.getSharedFolder(), relPath)
    } catch {
      this.sendJson(res, 400, { ok: false, error: 'invalid-path' })
      return
    }
    this.sendJson(res, 200, { ok: true, entries })
  }

  private handleDownload(res: http.ServerResponse, url: URL): void {
    const relPath = url.searchParams.get('path') ?? ''
    const target = resolveSafePath(this.getSharedFolder(), relPath)
    if (!target || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      res.writeHead(404)
      res.end()
      return
    }
    const stat = fs.statSync(target)
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': stat.size,
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(target))}`
    })
    fs.createReadStream(target).pipe(res)
  }

  private async handleUpload(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
    const relPath = url.searchParams.get('path') ?? ''
    const name = url.searchParams.get('name') ?? ''
    const dir = resolveSafePath(this.getSharedFolder(), relPath)
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

  private async handleMkdir(req: http.IncomingMessage, res: http.ServerResponse, _url: URL): Promise<void> {
    let body: { path: string; name: string }
    try {
      body = await this.readJsonBody(req, JSON_BODY_LIMIT_BYTES)
      createFolder(this.getSharedFolder(), body.path, body.name)
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
      renameEntry(this.getSharedFolder(), body.path, body.oldName, body.newName)
    } catch (err) {
      this.sendJson(res, 400, { ok: false, error: String(err) })
      return
    }
    this.sendJson(res, 200, { ok: true })
  }
}
