import type { Peer } from '../../../shared/types'

interface Props {
  peers: Peer[]
  selfDeviceId: string | null
  selectedPeerId: string | null
  onSelect: (deviceId: string) => void
}

export default function PeerList({ peers, selfDeviceId, selectedPeerId, onSelect }: Props): JSX.Element {
  return (
    <div className="panel peer-list">
      <h2>PC一覧</h2>
      <ul>
        {peers.map((peer) => {
          const isSelf = peer.deviceId === selfDeviceId
          return (
            <li key={peer.deviceId}>
              <button
                className={peer.deviceId === selectedPeerId ? 'peer-item selected' : 'peer-item'}
                onClick={() => onSelect(peer.deviceId)}
              >
                <span className="peer-dot" />
                <span className="peer-name">{peer.deviceName}</span>
                <span className="peer-address">{isSelf ? '自分' : peer.address}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {peers.length <= 1 && (
        <p className="empty-hint">同じWi-Fi/LANにLanDropを起動した他の端末が見つかりません…</p>
      )}
    </div>
  )
}
