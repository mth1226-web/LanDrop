// 受信側HTTPサーバー: /api/offer, /api/offer-response, /api/send-file（Electron非依存、http/fsのみ使用）
import http from 'node:http'
import fs from 'node:fs'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { TransferStore } from './transferStore'
import { ensureTempDir, resolveUniquePath, tempFilePath } from './fileSave'
import type { FileMeta, TransferOffer, TransferOfferResponse, TransferSession } from '../shared/types'

const OFFER_BODY_LIMIT_BYTES = 1_000_000 // オファーはメタデータのみなので十分な上限

export declare interface HttpServer {
  on(event: 'offer', listener: (payload: { session: TransferSession; fromAddress: string; fromHttpPort: number }) => void): this
  on(event: 'offer-response', listener: (session: TransferSession) => void): this
  on(event: 'transfer-progress', listener: (session: TransferSession) => void): this
  on(event: 'transfer-completed', listener: (session: TransferSession) => void): this
  on(event: 'transfer-failed', listener: (session: TransferSession) => void): this
  emit(event: 'offer', payload: { session: TransferSession; fromAddress: string; fromHttpPort: number }): boolean
  emit(event: 'offer-response', session: TransferSession): boolean
  emit(event: 'transfer-progress', session: TransferSession): boolean
  emit(event: 'transfer-completed', session: TransferSession): boolean
  emit(event: 'transfer-failed', session: TransferSession): boolean
}

export class HttpServer extends EventEmitter {
  private readonly server: http.Server
  private readonly transferStore: TransferStore
  private readonly getSaveFolder: () => string

  constructor(options: { transferStore: TransferStore; getSaveFolder: () => string }) {
    super()
    this.transferStore = options.transferStore
    this.getSaveFolder = options.getSaveFolder
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
    if (req.method === 'POST' && url.pathname === '/api/offer') {
      this.handleOffer(req, res)
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/offer-response') {
      this.handleOfferResponse(req, res)
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/send-file') {
      this.handleSendFile(req, res, url)
      return
    }
    res.writeHead(404)
    res.end()
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

  private async handleOffer(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let offer: TransferOffer
    try {
      offer = await this.readJsonBody<TransferOffer>(req, OFFER_BODY_LIMIT_BYTES)
    } catch {
      res.writeHead(400)
      res.end()
      return
    }
    if (!isValidOffer(offer)) {
      res.writeHead(400)
      res.end()
      return
    }

    const session = this.transferStore.create({
      transferId: offer.transferId,
      direction: 'incoming',
      peerDeviceId: offer.fromDeviceId,
      peerDeviceName: offer.fromDeviceName,
      files: offer.files,
      now: Date.now()
    })

    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))

    this.emit('offer', {
      session,
      fromAddress: req.socket.remoteAddress ?? '',
      fromHttpPort: offer.fromHttpPort
    })
  }

  private async handleOfferResponse(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let response: TransferOfferResponse
    try {
      response = await this.readJsonBody<TransferOfferResponse>(req, OFFER_BODY_LIMIT_BYTES)
    } catch {
      res.writeHead(400)
      res.end()
      return
    }
    const nextStatus = response.decision === 'accepted' ? 'accepted' : 'rejected'
    const transitioned = this.transferStore.transition(response.transferId, nextStatus)
    if (!transitioned) {
      res.writeHead(409)
      res.end()
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))

    const session = this.transferStore.get(response.transferId)
    if (session) this.emit('offer-response', session)
  }

  private handleSendFile(req: http.IncomingMessage, res: http.ServerResponse, url: URL): void {
    const transferId = url.searchParams.get('transferId') ?? ''
    const fileId = url.searchParams.get('fileId') ?? ''
    const session = this.transferStore.get(transferId)

    if (!session || session.direction !== 'incoming' || (session.status !== 'accepted' && session.status !== 'in_progress')) {
      res.writeHead(409)
      res.end()
      return
    }
    const fileMeta: FileMeta | undefined = session.files.find((f) => f.fileId === fileId)
    if (!fileMeta) {
      res.writeHead(400)
      res.end()
      return
    }
    if (session.status === 'accepted') this.transferStore.transition(transferId, 'in_progress')

    const saveFolder = this.getSaveFolder()
    ensureTempDir(saveFolder)
    const tempPath = tempFilePath(saveFolder, transferId, fileId)
    const writeStream = fs.createWriteStream(tempPath)

    let received = 0
    req.on('data', (chunk: Buffer) => {
      received += chunk.length
      this.transferStore.updateProgress(transferId, fileId, received)
      const current = this.transferStore.get(transferId)
      if (current) this.emit('transfer-progress', current)
    })

    req.on('error', (err) => {
      writeStream.destroy()
      fs.rm(tempPath, { force: true }, () => {})
      this.transferStore.transition(transferId, 'failed', String(err))
      const failedSession = this.transferStore.get(transferId)
      if (failedSession) this.emit('transfer-failed', failedSession)
      if (!res.headersSent) {
        res.writeHead(500)
        res.end()
      }
    })

    req.pipe(writeStream)

    writeStream.on('finish', () => {
      const finalPath = resolveUniquePath(saveFolder, fileMeta.name)
      fs.rename(tempPath, finalPath, (err) => {
        if (err) {
          this.transferStore.transition(transferId, 'failed', String(err))
          const failedSession = this.transferStore.get(transferId)
          if (failedSession) this.emit('transfer-failed', failedSession)
          res.writeHead(500)
          res.end()
          return
        }

        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))

        const current = this.transferStore.get(transferId)
        if (current && isAllFilesComplete(current)) {
          this.transferStore.transition(transferId, 'completed')
          const completedSession = this.transferStore.get(transferId)
          if (completedSession) this.emit('transfer-completed', completedSession)
        } else if (current) {
          this.emit('transfer-progress', current)
        }
      })
    })
  }
}

function isAllFilesComplete(session: TransferSession): boolean {
  return Object.values(session.fileProgress).every((p) => p.transferredBytes >= p.totalBytes)
}

function isValidOffer(value: unknown): value is TransferOffer {
  if (typeof value !== 'object' || value === null) return false
  const o = value as Record<string, unknown>
  return (
    typeof o.transferId === 'string' &&
    typeof o.fromDeviceId === 'string' &&
    typeof o.fromDeviceName === 'string' &&
    typeof o.fromHttpPort === 'number' &&
    Array.isArray(o.files) &&
    o.files.every(
      (f) =>
        typeof f === 'object' &&
        f !== null &&
        typeof (f as Record<string, unknown>).fileId === 'string' &&
        typeof (f as Record<string, unknown>).name === 'string' &&
        typeof (f as Record<string, unknown>).size === 'number' &&
        typeof (f as Record<string, unknown>).mimeType === 'string'
    )
  )
}

export function generateTransferId(): string {
  return randomUUID()
}
