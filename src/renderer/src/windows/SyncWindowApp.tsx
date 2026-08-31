import { useEffect, useState } from 'react'
import type { AppSettings, Peer, SyncPair, TransferActivity } from '../../../shared/types'
import SyncView from '../components/SyncView'

export default function SyncWindowApp(): JSX.Element | null {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [peers, setPeers] = useState<Peer[]>([])
  const [pairs, setPairs] = useState<SyncPair[]>([])
  const [activities, setActivities] = useState<Record<string, TransferActivity>>({})

  useEffect(() => {
    document.title = 'LanDrop - フォルダ同期'
    window.electronAPI.getSettings().then(setSettings)
    window.electronAPI.getPeers().then(setPeers)
    window.electronAPI.syncListPairs().then(setPairs)
    const unsubscribeSettings = window.electronAPI.onSettingsChanged(setSettings)
    const unsubscribePeers = window.electronAPI.onPeersChanged(setPeers)
    const unsubscribeActivity = window.electronAPI.onActivityUpdated((activity) => {
      setActivities((prev) => ({ ...prev, [activity.id]: activity }))
    })
    return () => {
      unsubscribeSettings()
      unsubscribePeers()
      unsubscribeActivity()
    }
  }, [])

  if (!settings) return null

  async function handleSavePair(pair: SyncPair): Promise<void> {
    setPairs(await window.electronAPI.syncSavePair(pair))
  }

  async function handleDeletePair(pairId: string): Promise<void> {
    if (!window.confirm('この同期ペアを削除しますか？(実際のファイルは削除されません)')) return
    setPairs(await window.electronAPI.syncDeletePair(pairId))
  }

  return (
    <SyncView
      pairs={pairs}
      peers={peers}
      selfDeviceId={settings.deviceId}
      selfDeviceName={settings.deviceName}
      activities={Object.values(activities).sort((a, b) => b.createdAt - a.createdAt)}
      onSavePair={handleSavePair}
      onDeletePair={handleDeletePair}
      onChooseLocalFolder={() => window.electronAPI.syncChooseLocalFolder()}
      onBrowseRemote={(peerDeviceId, relPath) => window.electronAPI.browseFolder(peerDeviceId, relPath)}
      onCompare={(pairId) => window.electronAPI.syncCompare(pairId)}
      onExecute={(pairId) => window.electronAPI.syncExecute(pairId)}
      onClose={() => window.close()}
    />
  )
}
