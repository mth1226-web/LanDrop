// 設定ファイルの読み書き（Electron非依存、fs/pathのみ使用。保存先パスはindex.tsがapp.getPath()で決める）
import fs from 'node:fs'
import path from 'node:path'
import type { AppSettings } from '../shared/types'

export function loadSettings(settingsFilePath: string, defaults: AppSettings): AppSettings {
  try {
    const raw = fs.readFileSync(settingsFilePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      deviceId: typeof parsed.deviceId === 'string' && parsed.deviceId ? parsed.deviceId : defaults.deviceId,
      deviceName: typeof parsed.deviceName === 'string' && parsed.deviceName ? parsed.deviceName : defaults.deviceName,
      saveFolder: typeof parsed.saveFolder === 'string' && parsed.saveFolder ? parsed.saveFolder : defaults.saveFolder
    }
  } catch {
    return defaults
  }
}

export function saveSettings(settingsFilePath: string, settings: AppSettings): void {
  fs.mkdirSync(path.dirname(settingsFilePath), { recursive: true })
  fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2), 'utf-8')
}
