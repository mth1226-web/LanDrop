import type { TransferSession } from '../../../shared/types'
import { formatBytes } from '../utils/format'

interface Props {
  session: TransferSession
  onRespond: (transferId: string, decision: 'accepted' | 'rejected') => void
}

export default function IncomingOfferDialog({ session, onRespond }: Props): JSX.Element {
  const totalSize = session.files.reduce((sum, f) => sum + f.size, 0)

  return (
    <div className="modal-overlay">
      <div className="modal offer-dialog">
        <h2>{session.peerDeviceName} からファイルが届きました</h2>
        <ul className="offer-file-list">
          {session.files.map((f) => (
            <li key={f.fileId}>
              {f.name}（{formatBytes(f.size)}）
            </li>
          ))}
        </ul>
        <p className="offer-total">合計 {formatBytes(totalSize)}</p>
        <div className="modal-actions">
          <button className="button secondary" onClick={() => onRespond(session.transferId, 'rejected')}>
            拒否
          </button>
          <button className="button primary" onClick={() => onRespond(session.transferId, 'accepted')}>
            受け取る
          </button>
        </div>
      </div>
    </div>
  )
}
