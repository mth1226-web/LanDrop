import type { UpdateState } from '../../../shared/types'

interface Props {
  updateState: UpdateState
  onCheck: () => void
  onApply: () => void
  onClose: () => void
}

function statusText(state: UpdateState): string {
  switch (state.phase) {
    case 'idle':
      return '「更新を確認」を押すと最新版を確認します'
    case 'checking':
      return '確認中…'
    case 'up-to-date':
      return '最新版です'
    case 'available':
      return `新しいバージョン ${state.latestVersion} が利用可能です`
    case 'downloading':
      return `ダウンロード中… ${state.percent ?? 0}%`
    case 'unsupported-platform':
      return 'この自動更新はWindows版のみ対応しています。Macは開発元の案内に従って手動で更新してください'
    case 'error':
      return `エラー: ${state.errorMessage ?? '不明なエラー'}`
    default:
      return ''
  }
}

export default function UpdateDialog({ updateState, onCheck, onApply, onClose }: Props): JSX.Element {
  const canApply = updateState.phase === 'available'
  const isBusy = updateState.phase === 'checking' || updateState.phase === 'downloading'

  return (
    <div className="modal-overlay">
      <div className="modal update-dialog">
        <h2>アップデート</h2>
        {updateState.currentVersion && <p className="update-current-version">現在のバージョン: {updateState.currentVersion}</p>}
        <p className="update-status">{statusText(updateState)}</p>
        {updateState.phase === 'downloading' && (
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${updateState.percent ?? 0}%` }} />
          </div>
        )}
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose} disabled={updateState.phase === 'downloading'}>
            閉じる
          </button>
          <button className="button secondary" onClick={onCheck} disabled={isBusy}>
            更新を確認
          </button>
          {canApply && (
            <button className="button primary" onClick={onApply} disabled={isBusy}>
              適用して再起動
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
