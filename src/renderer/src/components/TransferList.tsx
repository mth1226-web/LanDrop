import type { TransferSession } from '../../../shared/types'
import { formatBytes, statusLabel } from '../utils/format'

interface Props {
  sessions: TransferSession[]
}

function totalProgress(session: TransferSession): { transferred: number; total: number } {
  const values = Object.values(session.fileProgress)
  return {
    transferred: values.reduce((sum, p) => sum + p.transferredBytes, 0),
    total: values.reduce((sum, p) => sum + p.totalBytes, 0)
  }
}

export default function TransferList({ sessions }: Props): JSX.Element {
  if (sessions.length === 0) {
    return (
      <div className="panel transfer-list">
        <h2>転送履歴</h2>
        <p className="empty-hint">まだ転送はありません</p>
      </div>
    )
  }

  return (
    <div className="panel transfer-list">
      <h2>転送履歴</h2>
      <ul>
        {sessions.map((session) => {
          const { transferred, total } = totalProgress(session)
          const percent = total > 0 ? Math.round((transferred / total) * 100) : 0
          return (
            <li key={session.transferId} className={`transfer-item status-${session.status}`}>
              <div className="transfer-item-header">
                <span className="transfer-direction">{session.direction === 'outgoing' ? '送信' : '受信'}</span>
                <span className="transfer-peer">{session.peerDeviceName}</span>
                <span className="transfer-status">{statusLabel(session.status)}</span>
              </div>
              <div className="transfer-files">
                {session.files.map((f) => f.name).join(', ')}
              </div>
              {session.status === 'in_progress' && (
                <div className="progress-bar">
                  <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
                </div>
              )}
              {session.status === 'in_progress' && (
                <div className="transfer-progress-text">
                  {formatBytes(transferred)} / {formatBytes(total)}（{percent}%）
                </div>
              )}
              {session.status === 'failed' && session.errorMessage && (
                <div className="transfer-error">{session.errorMessage}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
