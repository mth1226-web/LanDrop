import type { ActivityStatus } from '../../../shared/types'

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

const STATUS_LABELS: Record<ActivityStatus, string> = {
  in_progress: '転送中',
  completed: '完了',
  failed: '失敗'
}

export function statusLabel(status: ActivityStatus): string {
  return STATUS_LABELS[status]
}

/** "#rrggbb" 形式のHEXカラーを "rgba(r, g, b, alpha)" に変換する。不正な形式なら透明に近いグレーを返す */
export function hexToRgba(hex: string, alpha: number): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex)
  if (!match) return `rgba(120, 120, 140, ${alpha})`
  const value = parseInt(match[1], 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
