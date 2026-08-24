import type { TransferActivity } from '../../../shared/types'
import { formatBytes, statusLabel } from '../utils/format'

interface Props {
  activities: TransferActivity[]
}

export default function ActivityList({ activities }: Props): JSX.Element {
  if (activities.length === 0) {
    return (
      <div className="panel activity-list">
        <h2>転送履歴</h2>
        <p className="empty-hint">まだ転送はありません</p>
      </div>
    )
  }

  return (
    <div className="panel activity-list">
      <h2>転送履歴</h2>
      <ul>
        {activities.map((activity) => {
          const percent = activity.totalBytes > 0 ? Math.round((activity.transferredBytes / activity.totalBytes) * 100) : 0
          return (
            <li key={activity.id} className={`activity-item status-${activity.status}`}>
              <div className="activity-item-header">
                <span className="activity-direction">{activity.direction === 'upload' ? 'アップロード' : 'ダウンロード'}</span>
                <span className="activity-peer">{activity.peerDeviceName}</span>
                <span className="activity-status">{statusLabel(activity.status)}</span>
              </div>
              <div className="activity-file">{activity.fileName}</div>
              {activity.status === 'in_progress' && (
                <>
                  <div className="progress-bar">
                    <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
                  </div>
                  <div className="transfer-progress-text">
                    {formatBytes(activity.transferredBytes)} / {formatBytes(activity.totalBytes)}（{percent}%）
                  </div>
                </>
              )}
              {activity.status === 'failed' && activity.errorMessage && (
                <div className="transfer-error">{activity.errorMessage}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
