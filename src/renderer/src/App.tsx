import { useEffect, useState } from 'react'
import { useAppStore } from './store'
import PeerList from './components/PeerList'
import FolderBrowser from './components/FolderBrowser'
import ActivityList from './components/ActivityList'
import FirewallHintBanner from './components/FirewallHintBanner'
import { useFolderSession } from './hooks/useFolderSession'
import type { Peer, SortMode, ViewMode } from '../../shared/types'

export default function App(): JSX.Element {
  const peers = useAppStore((s) => s.peers)
  const settings = useAppStore((s) => s.settings)
  const activities = useAppStore((s) => s.activities)
  const selectedPeerId = useAppStore((s) => s.selectedPeerId)
  const updateState = useAppStore((s) => s.updateState)

  const setPeers = useAppStore((s) => s.setPeers)
  const setSettings = useAppStore((s) => s.setSettings)
  const upsertActivity = useAppStore((s) => s.upsertActivity)
  const selectPeer = useAppStore((s) => s.selectPeer)
  const setUpdateState = useAppStore((s) => s.setUpdateState)

  const [ownPreviewBaseUrl, setOwnPreviewBaseUrl] = useState<string | null>(null)

  const isSelf = selectedPeerId === settings?.deviceId
  const displayPeers: Peer[] = settings
    ? [
        { deviceId: settings.deviceId, deviceName: settings.deviceName, address: '', httpPort: 0, lastSeenAt: Date.now() },
        ...peers
      ]
    : peers
  const selectedPeer = displayPeers.find((p) => p.deviceId === selectedPeerId) ?? null
  const activityList = Object.values(activities).sort((a, b) => b.createdAt - a.createdAt)
  const previewBaseUrl = isSelf ? ownPreviewBaseUrl : selectedPeer ? `http://${selectedPeer.address}:${selectedPeer.httpPort}` : null

  const session = useFolderSession({ peerDeviceId: selectedPeerId, previewBaseUrl })

  useEffect(() => {
    window.electronAPI.getPeers().then(setPeers)
    window.electronAPI.getSettings().then(setSettings)
    const unsubscribePeers = window.electronAPI.onPeersChanged(setPeers)
    const unsubscribeActivity = window.electronAPI.onActivityUpdated(upsertActivity)
    const unsubscribeUpdate = window.electronAPI.onUpdateState(setUpdateState)
    const unsubscribeSettings = window.electronAPI.onSettingsChanged(setSettings)
    void window.electronAPI.checkForUpdate()
    window.electronAPI.getOwnPreviewBaseUrl().then(setOwnPreviewBaseUrl)
    return () => {
      unsubscribePeers()
      unsubscribeActivity()
      unsubscribeUpdate()
      unsubscribeSettings()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return window.electronAPI.onPeerUploaded(() => session.reloadEntries())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.reloadEntries])

  useEffect(() => {
    if (settings && !selectedPeerId) selectPeer(settings.deviceId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])

  useEffect(() => {
    // 別ウインドウの設定画面で共有フォルダが追加/削除された場合もここで再読み込みする
    session.reloadEntries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.sharedFolders])

  async function handleChangeSortMode(mode: SortMode): Promise<void> {
    const updated = await window.electronAPI.setSortMode(mode)
    setSettings(updated)
  }

  async function handleChangeViewMode(mode: ViewMode): Promise<void> {
    const updated = await window.electronAPI.setViewMode(mode)
    setSettings(updated)
  }

  function handleOpenNewWindow(): void {
    if (!selectedPeerId) return
    void window.electronAPI.openBrowseWindow(selectedPeerId, session.currentPath)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>LanDrop</h1>
        <div className="app-header-actions">
          <button className="button secondary" onClick={handleOpenNewWindow} disabled={!selectedPeerId}>
            新しいウインドウ
          </button>
          <button className="button secondary" onClick={() => void window.electronAPI.openPreviewWindow(null)}>
            プレビュー
          </button>
          <button className="button secondary" onClick={() => void window.electronAPI.openChatWindow()}>
            チャット
          </button>
          <button className="button secondary" onClick={() => void window.electronAPI.openUpdateWindow()}>
            アップデート{updateState.phase === 'available' && <span className="update-dot" />}
          </button>
          <button className="button secondary" onClick={() => void window.electronAPI.openSettingsWindow()}>
            設定
          </button>
        </div>
      </header>

      <FirewallHintBanner />

      <main className="app-main">
        <PeerList peers={displayPeers} selfDeviceId={settings?.deviceId ?? null} selectedPeerId={selectedPeerId} onSelect={selectPeer} />
        <div className="app-center">
          {selectedPeer ? (
            <FolderBrowser
              peerName={isSelf ? `${selectedPeer.deviceName}（自分）` : selectedPeer.deviceName}
              peerDeviceId={selectedPeer.deviceId}
              currentPath={session.currentPath}
              entries={session.entries}
              metadata={session.entryMetadata}
              downloadFolderOverrides={settings?.downloadFolderOverrides ?? {}}
              isLoading={session.isLoadingEntries}
              isSelf={isSelf}
              previewBaseUrl={previewBaseUrl}
              accentColor={settings?.accentColor}
              sortMode={settings?.sortMode ?? 'name'}
              viewMode={settings?.viewMode ?? 'details'}
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
            />
          ) : (
            <div className="panel folder-browser">
              <p className="empty-hint">左のPC一覧から見たい端末を選んでください</p>
            </div>
          )}
          <ActivityList activities={activityList} />
        </div>
      </main>
    </div>
  )
}
