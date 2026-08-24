import type { TransferStatus } from '../../../shared/types'

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

const STATUS_LABELS: Record<TransferStatus, string> = {
  offered: '応答待ち',
  accepted: '承諾済み',
  rejected: '拒否されました',
  timeout: 'タイムアウト',
  in_progress: '転送中',
  completed: '完了',
  failed: '失敗'
}

export function statusLabel(status: TransferStatus): string {
  return STATUS_LABELS[status]
}
