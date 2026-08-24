// 送信側HTTPクライアント: offer送信、offer-response送信、ファイルのストリーミング送信（Electron非依存）
import http from 'node:http'
import fs from 'node:fs'
import type { TransferOffer, TransferOfferResponse } from '../shared/types'

function postJson(address: string, port: number, path: string, body: unknown): Promise<void> {
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
        res.resume()
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve()
        } else {
          reject(new Error(`unexpected status ${res.statusCode}`))
        }
      }
    )
    req.on('error', reject)
    req.end(payload)
  })
}

export function sendOffer(address: string, port: number, offer: TransferOffer): Promise<void> {
  return postJson(address, port, '/api/offer', offer)
}

export function sendOfferResponse(address: string, port: number, response: TransferOfferResponse): Promise<void> {
  return postJson(address, port, '/api/offer-response', response)
}

export function sendFile(params: {
  address: string
  port: number
  transferId: string
  fileId: string
  filePath: string
  size: number
  onProgress?: (transferredBytes: number) => void
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const path = `/api/send-file?transferId=${encodeURIComponent(params.transferId)}&fileId=${encodeURIComponent(params.fileId)}`
    const req = http.request(
      {
        host: params.address,
        port: params.port,
        path,
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream', 'content-length': params.size }
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
