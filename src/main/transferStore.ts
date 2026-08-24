// 転送セッションの状態機械を扱う純粋なストア（IOなし、node:testで直接検証可能）
//
// 状態遷移: offered -> accepted -> in_progress -> completed
//           offered -> rejected
//           offered -> timeout
//           (offered|accepted|in_progress) -> failed
import type { FileMeta, TransferDirection, TransferSession, TransferStatus } from '../shared/types'

const VALID_TRANSITIONS: Record<TransferStatus, TransferStatus[]> = {
  offered: ['accepted', 'rejected', 'timeout', 'failed'],
  accepted: ['in_progress', 'failed'],
  in_progress: ['completed', 'failed'],
  rejected: [],
  timeout: [],
  completed: [],
  failed: []
}

export class TransferStore {
  private readonly sessions = new Map<string, TransferSession>()

  create(params: {
    transferId: string
    direction: TransferDirection
    peerDeviceId: string
    peerDeviceName: string
    files: FileMeta[]
    now: number
  }): TransferSession {
    const session: TransferSession = {
      transferId: params.transferId,
      direction: params.direction,
      peerDeviceId: params.peerDeviceId,
      peerDeviceName: params.peerDeviceName,
      files: params.files,
      status: 'offered',
      createdAt: params.now,
      fileProgress: Object.fromEntries(
        params.files.map((f) => [f.fileId, { fileId: f.fileId, transferredBytes: 0, totalBytes: f.size }])
      )
    }
    this.sessions.set(params.transferId, session)
    return session
  }

  get(transferId: string): TransferSession | undefined {
    return this.sessions.get(transferId)
  }

  getAll(): TransferSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.createdAt - a.createdAt)
  }

  /** 状態を遷移させる。不正な遷移ならfalseを返し何もしない */
  transition(transferId: string, next: TransferStatus, errorMessage?: string): boolean {
    const session = this.sessions.get(transferId)
    if (!session) return false
    if (!VALID_TRANSITIONS[session.status].includes(next)) return false
    session.status = next
    if (errorMessage !== undefined) session.errorMessage = errorMessage
    return true
  }

  /** in_progress中のみ進捗を更新できる */
  updateProgress(transferId: string, fileId: string, transferredBytes: number): boolean {
    const session = this.sessions.get(transferId)
    if (!session || session.status !== 'in_progress') return false
    const progress = session.fileProgress[fileId]
    if (!progress) return false
    progress.transferredBytes = transferredBytes
    return true
  }
}
