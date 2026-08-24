import { useEffect, useState } from 'react'
import { useAppStore } from './store'
import PeerList from './components/PeerList'
import DropZone from './components/DropZone'
import TransferList from './components/TransferList'
import IncomingOfferDialog from './components/IncomingOfferDialog'
import SettingsDialog from './components/SettingsDialog'
import FirewallHintBanner from './components/FirewallHintBanner'

export default function App(): JSX.Element {
  const peers = useAppStore((s) => s.peers)
  const sessions = useAppStore((s) => s.sessions)
  const settings = useAppStore((s) => s.settings)
  const setPeers = useAppStore((s) => s.setPeers)
  const upsertSession = useAppStore((s) => s.upsertSession)
  const setSettings = useAppStore((s) => s.setSettings)

  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    window.electronAPI.getPeers().then(setPeers)
    window.electronAPI.getSettings().then(setSettings)
    const unsubscribePeers = window.electronAPI.onPeersChanged(setPeers)
    const unsubscribeSessions = window.electronAPI.onTransferSessionUpdated(upsertSession)
    return () => {
      unsubscribePeers()
      unsubscribeSessions()
    }
  }, [setPeers, setSettings, upsertSession])

  const selectedPeer = peers.find((p) => p.deviceId === selectedPeerId) ?? null
  const sessionList = Object.values(sessions).sort((a, b) => b.createdAt - a.createdAt)
  const incomingOffer = sessionList.find((s) => s.direction === 'incoming' && s.status === 'offered')

  function handleSendFiles(filePaths: string[]): void {
    if (!selectedPeerId) return
    void window.electronAPI.sendFiles(selectedPeerId, filePaths)
  }

  function handleRespondToOffer(transferId: string, decision: 'accepted' | 'rejected'): void {
    void window.electronAPI.respondToOffer(transferId, decision)
  }

  async function handleSaveSettings(patch: { deviceName: string; saveFolder: string }): Promise<void> {
    const updated = await window.electronAPI.setSettings(patch)
    setSettings(updated)
    setShowSettings(false)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>LanDrop</h1>
        <button className="button secondary" onClick={() => setShowSettings(true)}>
          設定
        </button>
      </header>

      <FirewallHintBanner />

      <main className="app-main">
        <PeerList peers={peers} selectedPeerId={selectedPeerId} onSelect={setSelectedPeerId} />
        <div className="app-center">
          <DropZone selectedPeer={selectedPeer} onSendFiles={handleSendFiles} />
          <TransferList sessions={sessionList} />
        </div>
      </main>

      {incomingOffer && <IncomingOfferDialog session={incomingOffer} onRespond={handleRespondToOffer} />}
      {showSettings && settings && (
        <SettingsDialog settings={settings} onSave={handleSaveSettings} onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}
