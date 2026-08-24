import { useState } from 'react'
import type { AppSettings } from '../../../shared/types'

interface Props {
  settings: AppSettings
  onSave: (patch: { deviceName: string; saveFolder: string }) => void
  onClose: () => void
}

export default function SettingsDialog({ settings, onSave, onClose }: Props): JSX.Element {
  const [deviceName, setDeviceName] = useState(settings.deviceName)
  const [saveFolder, setSaveFolder] = useState(settings.saveFolder)

  async function handleChooseFolder(): Promise<void> {
    const chosen = await window.electronAPI.chooseSaveFolder()
    if (chosen) setSaveFolder(chosen)
  }

  return (
    <div className="modal-overlay">
      <div className="modal settings-dialog">
        <h2>設定</h2>
        <label className="field">
          <span>表示名（相手の端末一覧に表示されます）</span>
          <input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
        </label>
        <label className="field">
          <span>保存先フォルダ</span>
          <div className="folder-row">
            <input value={saveFolder} readOnly />
            <button className="button secondary" onClick={handleChooseFolder}>
              変更
            </button>
          </div>
        </label>
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            キャンセル
          </button>
          <button
            className="button primary"
            onClick={() => onSave({ deviceName: deviceName.trim() || settings.deviceName, saveFolder })}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
