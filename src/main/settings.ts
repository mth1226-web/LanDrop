// 設定ファイルの読み書き（Electron非依存、fs/pathのみ使用。保存先パスはindex.tsがapp.getPath()で決める）
import fs from 'node:fs'
import path from 'node:path'
import type { AppSettings, SortMode, ViewMode } from '../shared/types'

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/
const SORT_MODES: SortMode[] = ['name', 'date', 'manual']
const VIEW_MODES: ViewMode[] = [
  'extraLargeIcons',
  'largeIcons',
  'mediumIcons',
  'smallIcons',
  'list',
  'details',
  'tiles',
  'content'
]

export function loadSettings(settingsFilePath: string, defaults: AppSettings): AppSettings {
  try {
    const raw = fs.readFileSync(settingsFilePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      deviceId: typeof parsed.deviceId === 'string' && parsed.deviceId ? parsed.deviceId : defaults.deviceId,
      deviceName: typeof parsed.deviceName === 'string' && parsed.deviceName ? parsed.deviceName : defaults.deviceName,
      sharedFolders:
        Array.isArray(parsed.sharedFolders) && parsed.sharedFolders.every((f) => typeof f === 'string')
          ? parsed.sharedFolders
          : defaults.sharedFolders,
      downloadFolder:
        typeof parsed.downloadFolder === 'string' && parsed.downloadFolder
          ? parsed.downloadFolder
          : defaults.downloadFolder,
      accentColor:
        typeof parsed.accentColor === 'string' && HEX_COLOR_PATTERN.test(parsed.accentColor)
          ? parsed.accentColor
          : defaults.accentColor,
      preferredNetworkInterface:
        typeof parsed.preferredNetworkInterface === 'string' && parsed.preferredNetworkInterface
          ? parsed.preferredNetworkInterface
          : defaults.preferredNetworkInterface,
      downloadFolderOverrides:
        typeof parsed.downloadFolderOverrides === 'object' &&
        parsed.downloadFolderOverrides !== null &&
        !Array.isArray(parsed.downloadFolderOverrides) &&
        Object.values(parsed.downloadFolderOverrides).every((v) => typeof v === 'string')
          ? parsed.downloadFolderOverrides
          : defaults.downloadFolderOverrides,
      sortMode:
        typeof parsed.sortMode === 'string' && SORT_MODES.includes(parsed.sortMode as SortMode)
          ? (parsed.sortMode as SortMode)
          : defaults.sortMode,
      viewMode:
        typeof parsed.viewMode === 'string' && VIEW_MODES.includes(parsed.viewMode as ViewMode)
          ? (parsed.viewMode as ViewMode)
          : defaults.viewMode
    }
  } catch {
    return defaults
  }
}

export function saveSettings(settingsFilePath: string, settings: AppSettings): void {
  fs.mkdirSync(path.dirname(settingsFilePath), { recursive: true })
  fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2), 'utf-8')
}
