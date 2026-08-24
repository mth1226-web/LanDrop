// アップロード/ダウンロードの進捗を記録する純粋なストア（IOなし、node:testで直接検証可能）
import type { ActivityDirection, TransferActivity } from '../shared/types'

export class ActivityStore {
  private readonly activities = new Map<string, TransferActivity>()

  create(params: {
    id: string
    direction: ActivityDirection
    peerDeviceId: string
    peerDeviceName: string
    fileName: string
    totalBytes: number
    now: number
  }): TransferActivity {
    const activity: TransferActivity = {
      id: params.id,
      direction: params.direction,
      peerDeviceId: params.peerDeviceId,
      peerDeviceName: params.peerDeviceName,
      fileName: params.fileName,
      transferredBytes: 0,
      totalBytes: params.totalBytes,
      status: 'in_progress',
      createdAt: params.now
    }
    this.activities.set(params.id, activity)
    return activity
  }

  get(id: string): TransferActivity | undefined {
    return this.activities.get(id)
  }

  getAll(): TransferActivity[] {
    return Array.from(this.activities.values()).sort((a, b) => b.createdAt - a.createdAt)
  }

  /** in_progress中のみ進捗を更新できる。戻り値は更新できたか */
  updateProgress(id: string, transferredBytes: number): boolean {
    const activity = this.activities.get(id)
    if (!activity || activity.status !== 'in_progress') return false
    activity.transferredBytes = transferredBytes
    return true
  }

  /** in_progress中のみ完了/失敗に遷移できる。戻り値は遷移できたか */
  complete(id: string): boolean {
    const activity = this.activities.get(id)
    if (!activity || activity.status !== 'in_progress') return false
    activity.status = 'completed'
    activity.transferredBytes = activity.totalBytes
    return true
  }

  fail(id: string, errorMessage: string): boolean {
    const activity = this.activities.get(id)
    if (!activity || activity.status !== 'in_progress') return false
    activity.status = 'failed'
    activity.errorMessage = errorMessage
    return true
  }
}
