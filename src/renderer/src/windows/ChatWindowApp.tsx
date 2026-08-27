import { useEffect, useState } from 'react'
import type { AppSettings, Peer } from '../../../shared/types'
import ChatDialog from '../components/ChatDialog'

export default function ChatWindowApp(): JSX.Element | null {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [peers, setPeers] = useState<Peer[]>([])

  useEffect(() => {
    document.title = 'LanDrop - チャット'
    window.electronAPI.getSettings().then(setSettings)
    window.electronAPI.getPeers().then(setPeers)
    const unsubscribeSettings = window.electronAPI.onSettingsChanged(setSettings)
    const unsubscribePeers = window.electronAPI.onPeersChanged(setPeers)
    return () => {
      unsubscribeSettings()
      unsubscribePeers()
    }
  }, [])

  if (!settings) return null

  return (
    <ChatDialog
      peers={peers}
      selfDeviceId={settings.deviceId}
      selfDeviceName={settings.deviceName}
      onClose={() => window.close()}
    />
  )
}
