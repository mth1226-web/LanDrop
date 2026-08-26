import { useState } from 'react'
import type { AppSettings } from '../../../shared/types'
import { isInternalDragActive } from '../utils/internalDrag'
import PhoneAccessCard from './PhoneAccessCard'

const ACCENT_COLOR_PRESETS = ['#4caf6a', '#5878e8', '#e0a030', '#d05a5a', '#a05ae0', '#30b8c0', '#e05a9c']

interface Props {
  settings: AppSettings
  onSaveDeviceName: (deviceName: string) => void
  onAddSharedFolders: (paths: string[]) => void
  onChooseSharedFolder: () => void
  onRemoveSharedFolder: (folderPath: string) => void
  onOpenFolder: (folderPath: string) => void
  onChooseDownloadFolder: () => void
  onChangeAccentColor: (color: string) => void
  onClose: () => void
}

export default function SettingsDialog({
  settings,
  onSaveDeviceName,
  onAddSharedFolders,
  onChooseSharedFolder,
  onRemoveSharedFolder,
  onOpenFolder,
  onChooseDownloadFolder,
  onChangeAccentColor,
  onClose
}: Props): JSX.Element {
  const [deviceName, setDeviceName] = useState(settings.deviceName)
  const [isDragOver, setIsDragOver] = useState(false)

  function handleDrop(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setIsDragOver(false)
    if (isInternalDragActive()) return
    const paths = Array.from(e.dataTransfer.files).map((file) => window.electronAPI.getPathForFile(file))
    if (paths.length > 0) onAddSharedFolders(paths)
  }

  return (
    <div className="modal-overlay">
      <div className="modal settings-dialog">
        <h2>設定</h2>
        <label className="field">
          <span>表示名（相手のPC一覧に表示されます）</span>
          <input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
        </label>

        <div className="field">
          <span>共有フォルダ（他のPCから見える・書き込める場所。複数設定できます）</span>
          <ul className="shared-folder-list">
            {settings.sharedFolders.length === 0 && <li className="empty-hint">共有フォルダが設定されていません</li>}
            {settings.sharedFolders.map((folderPath) => (
              <li key={folderPath} className="shared-folder-item">
                <span className="shared-folder-path" title={folderPath}>
                  {folderPath}
                </span>
                <button className="button secondary small" onClick={() => onOpenFolder(folderPath)}>
                  開く
                </button>
                <button className="button secondary small" onClick={() => onRemoveSharedFolder(folderPath)}>
                  削除
                </button>
              </li>
            ))}
          </ul>
          <div
            className={isDragOver ? 'shared-folder-dropzone drag-over' : 'shared-folder-dropzone'}
            onDragOver={(e) => {
              e.preventDefault()
              if (!isInternalDragActive()) setIsDragOver(true)
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
          >
            <span>ここにフォルダをドラッグ&ドロップして追加</span>
            <button className="button secondary small" onClick={onChooseSharedFolder}>
              フォルダを選んで追加
            </button>
          </div>
        </div>

        <label className="field">
          <span>ダウンロード保存先（他のPCから取得したファイルの保存先）</span>
          <div className="folder-row">
            <input value={settings.downloadFolder} readOnly />
            <button className="button secondary" onClick={onChooseDownloadFolder}>
              変更
            </button>
          </div>
        </label>

        <div className="field">
          <span>自分のPCのフォルダ表示エリアの色</span>
          <div className="accent-color-row">
            {ACCENT_COLOR_PRESETS.map((color) => (
              <button
                key={color}
                className={color === settings.accentColor ? 'accent-swatch selected' : 'accent-swatch'}
                style={{ backgroundColor: color }}
                aria-label={color}
                onClick={() => onChangeAccentColor(color)}
              />
            ))}
            <input
              type="color"
              className="accent-color-picker"
              value={settings.accentColor}
              onChange={(e) => onChangeAccentColor(e.target.value)}
            />
          </div>
        </div>

        <PhoneAccessCard />

        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            閉じる
          </button>
          <button
            className="button primary"
            onClick={() => {
              onSaveDeviceName(deviceName.trim() || settings.deviceName)
              onClose()
            }}
          >
            表示名を保存
          </button>
        </div>
      </div>
    </div>
  )
}
