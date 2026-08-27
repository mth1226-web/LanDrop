import { useEffect, useState } from 'react'
import FolderBrowser from '../components/FolderBrowser'
import { useFolderSession } from '../hooks/useFolderSession'
import type { AppSettings, Peer, SortMode, ViewMode } from '../../../shared/types'

interface Props {
  peerDeviceId: string
  initialPath: string
}

export default function BrowseWindowApp({ peerDeviceId, initialPath }: Props): JSX.Element | null {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [peers, setPeers] = useState<Peer[]>([])
  const [ownPreviewBaseUrl, setOwnPreviewBaseUrl] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.getSettings().then(setSettings)
    window.electronAPI.getPeers().then(setPeers)
    window.electronAPI.getOwnPreviewBaseUrl().then(setOwnPreviewBaseUrl)
    const unsubscribeSettings = window.electronAPI.onSettingsChanged(setSettings)
    const unsubscribePeers = window.electronAPI.onPeersChanged(setPeers)
    return () => {
      unsubscribeSettings()
      unsubscribePeers()
    }
  }, [])

  const isSelf = peerDeviceId === settings?.deviceId
  const peer: Peer | null =
    settings && isSelf
      ? { deviceId: settings.deviceId, deviceName: settings.deviceName, address: '', httpPort: 0, lastSeenAt: Date.now() }
      : (peers.find((p) => p.deviceId === peerDeviceId) ?? null)
  const previewBaseUrl = isSelf ? ownPreviewBaseUrl : peer ? `http://${peer.address}:${peer.httpPort}` : null

  const session = useFolderSession({ peerDeviceId, previewBaseUrl, initialPath })

  useEffect(() => {
    document.title = peer ? `LanDrop - ${peer.deviceName}${isSelf ? '（自分）' : ''}` : 'LanDrop'
  }, [peer, isSelf])

  async function handleChangeSortMode(mode: SortMode): Promise<void> {
    await window.electronAPI.setSortMode(mode)
  }

  async function handleChangeViewMode(mode: ViewMode): Promise<void> {
    await window.electronAPI.setViewMode(mode)
  }

  if (!settings || !peer) return null

  return (
    <div className="app">
      <main className="app-main">
        <div className="app-center">
          <FolderBrowser
            peerName={isSelf ? `${peer.deviceName}（自分）` : peer.deviceName}
            peerDeviceId={peer.deviceId}
            currentPath={session.currentPath}
            entries={session.entries}
            metadata={session.entryMetadata}
            downloadFolderOverrides={settings.downloadFolderOverrides}
            isLoading={session.isLoadingEntries}
            isSelf={isSelf}
            previewBaseUrl={previewBaseUrl}
            accentColor={settings.accentColor}
            sortMode={settings.sortMode}
            viewMode={settings.viewMode}
            customOrder={session.customOrder}
            onNavigate={session.setCurrentPath}
            onUploadFiles={session.handleUploadFiles}
            onCreateFolder={session.handleCreateFolder}
            onRename={session.handleRename}
            onDownload={session.handleDownload}
            onRevealLocal={session.handleRevealLocal}
            onSaveMetadata={session.handleSaveMetadata}
            onSetDownloadFolderOverride={session.handleSetDownloadFolderOverride}
            onRemoveDownloadFolderOverride={session.handleRemoveDownloadFolderOverride}
            onPreviewEntry={session.handlePreviewEntry}
            onChangeSortMode={handleChangeSortMode}
            onChangeViewMode={handleChangeViewMode}
            onMoveEntry={session.handleMoveEntry}
            onReorderEntries={session.handleReorderEntries}
            clipboard={session.clipboard}
            onCopyEntries={session.handleCopyEntries}
            onCutEntries={session.handleCutEntries}
            onPasteEntries={session.handlePasteEntries}
            onTrashEntries={session.handleTrashEntries}
            onCompressEntries={session.handleCompressEntries}
            onExtractEntry={session.handleExtractEntry}
          />
        </div>
      </main>
    </div>
  )
}
