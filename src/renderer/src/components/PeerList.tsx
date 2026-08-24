import type { Peer } from '../../../shared/types'

interface Props {
  peers: Peer[]
  selectedPeerId: string | null
  onSelect: (deviceId: string) => void
}

export default function PeerList({ peers, selectedPeerId, onSelect }: Props): JSX.Element {
  if (peers.length === 0) {
    return (
      <div className="panel peer-list">
        <h2>近くの端末</h2>
        <p className="empty-hint">同じWi-Fi/LANにLanDropを起動した端末が見つかりません…</p>
      </div>
    )
  }

  return (
    <div className="panel peer-list">
      <h2>近くの端末</h2>
      <ul>
        {peers.map((peer) => (
          <li key={peer.deviceId}>
            <button
              className={peer.deviceId === selectedPeerId ? 'peer-item selected' : 'peer-item'}
              onClick={() => onSelect(peer.deviceId)}
            >
              <span className="peer-dot" />
              <span className="peer-name">{peer.deviceName}</span>
              <span className="peer-address">{peer.address}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
