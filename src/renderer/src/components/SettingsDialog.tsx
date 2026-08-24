import { useState } from 'react'
import type { AppSettings } from '../../../shared/types'

interface Props {
  settings: AppSettings
  onSaveDeviceName: (deviceName: string) => void
  onChooseSharedFolder: () => void
  onChooseDownloadFolder: () => void
  onClose: () => void
}

export default function SettingsDialog({
  settings,
  onSaveDeviceName,
  onChooseSharedFolder,
  onChooseDownloadFolder,
  onClose
}: Props): JSX.Element {
  const [deviceName, setDeviceName] = useState(settings.deviceName)

  return (
    <div className="modal-overlay">
      <div className="modal settings-dialog">
        <h2>設定</h2>
        <label className="field">
          <span>表示名（相手のPC一覧に表示されます）</span>
          <input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
        </label>
        <label className="field">
          <span>共有フォルダ（他のPCから見える・書き込める場所）</span>
          <div className="folder-row">
            <input value={settings.sharedFolder} readOnly />
            <button className="button secondary" onClick={onChooseSharedFolder}>
              変更
            </button>
          </div>
        </label>
        <label className="field">
          <span>ダウンロード保存先（他のPCから取得したファイルの保存先）</span>
          <div className="folder-row">
            <input value={settings.downloadFolder} readOnly />
            <button className="button secondary" onClick={onChooseDownloadFolder}>
              変更
            </button>
          </div>
        </label>
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
