import { useEffect, useState } from 'react'
import { useAppStore, joinRelPath } from './store'
import PeerList from './components/PeerList'
import FolderBrowser from './components/FolderBrowser'
import ActivityList from './components/ActivityList'
import FirewallHintBanner from './components/FirewallHintBanner'
import type { BrowseEntry, EntryMetadata, Peer, SortMode } from '../../shared/types'
import { effectiveManualOrder, moveNameInOrder, moveNameRelativeTo } from './utils/sortEntries'

export default function App(): JSX.Element {
  const peers = useAppStore((s) => s.peers)
  const settings = useAppStore((s) => s.settings)
  const activities = useAppStore((s) => s.activities)
  const selectedPeerId = useAppStore((s) => s.selectedPeerId)
  const currentPath = useAppStore((s) => s.currentPath)
  const entries = useAppStore((s) => s.entries)
  const entryMetadata = useAppStore((s) => s.entryMetadata)
  const isLoadingEntries = useAppStore((s) => s.isLoadingEntries)
  const updateState = useAppStore((s) => s.updateState)

  const setPeers = useAppStore((s) => s.setPeers)
  const setSettings = useAppStore((s) => s.setSettings)
  const upsertActivity = useAppStore((s) => s.upsertActivity)
  const selectPeer = useAppStore((s) => s.selectPeer)
  const setCurrentPath = useAppStore((s) => s.setCurrentPath)
  const setEntries = useAppStore((s) => s.setEntries)
  const setEntryMetadata = useAppStore((s) => s.setEntryMetadata)
  const upsertEntryMetadata = useAppStore((s) => s.upsertEntryMetadata)
  const setLoadingEntries = useAppStore((s) => s.setLoadingEntries)
  const setUpdateState = useAppStore((s) => s.setUpdateState)

  const [ownPreviewBaseUrl, setOwnPreviewBaseUrl] = useState<string | null>(null)
  const [customOrder, setCustomOrderState] = useState<string[]>([])

  useEffect(() => {
    window.electronAPI.getPeers().then(setPeers)
    window.electronAPI.getSettings().then(setSettings)
    const unsubscribePeers = window.electronAPI.onPeersChanged(setPeers)
    const unsubscribeActivity = window.electronAPI.onActivityUpdated(upsertActivity)
    const unsubscribeUploaded = window.electronAPI.onPeerUploaded(() => reloadEntries())
    const unsubscribeUpdate = window.electronAPI.onUpdateState(setUpdateState)
    const unsubscribeSettings = window.electronAPI.onSettingsChanged(setSettings)
    void window.electronAPI.checkForUpdate()
    window.electronAPI.getOwnPreviewBaseUrl().then(setOwnPreviewBaseUrl)
    return () => {
      unsubscribePeers()
      unsubscribeActivity()
      unsubscribeUploaded()
      unsubscribeUpdate()
      unsubscribeSettings()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (settings && !selectedPeerId) selectPeer(settings.deviceId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])

  useEffect(() => {
    reloadEntries()
    // 別ウインドウの設定画面で共有フォルダが追加/削除された場合もここで再読み込みする
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeerId, currentPath, settings?.sharedFolders])

  function reloadEntries(): void {
    if (!selectedPeerId) return
    setLoadingEntries(true)
    window.electronAPI
      .browseFolder(selectedPeerId, currentPath)
      .then((list) => {
        setEntries(list)
        return window.electronAPI.getEntryMetadataForChildren(
          selectedPeerId,
          currentPath,
          list.map((e) => e.name)
        )
      })
      .then(setEntryMetadata)
      .catch(() => setEntries([]))
      .finally(() => setLoadingEntries(false))
    window.electronAPI.getCustomOrder(selectedPeerId, currentPath).then(setCustomOrderState)
  }

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

  function handleUploadFiles(filePaths: string[]): void {
    if (!selectedPeerId) return
    window.electronAPI.uploadFiles(selectedPeerId, currentPath, filePaths).then(() => reloadEntries())
  }

  function handleCreateFolder(name: string): void {
    if (!selectedPeerId) return
    window.electronAPI.createFolder(selectedPeerId, currentPath, name).then(() => reloadEntries())
  }

  function handleRename(oldName: string, newName: string): void {
    if (!selectedPeerId) return
    window.electronAPI.renameEntry(selectedPeerId, currentPath, oldName, newName).then(() => reloadEntries())
  }

  function handleDownload(selected: BrowseEntry[]): void {
    if (!selectedPeerId || selected.length === 0) return
    void window.electronAPI.downloadEntries(selectedPeerId, currentPath, selected)
  }

  function handleRevealLocal(entry: BrowseEntry): void {
    void window.electronAPI.revealLocalFile(joinRelPath(currentPath, entry.name))
  }

  function handlePreviewEntry(entry: BrowseEntry): void {
    if (!previewBaseUrl) return
    const relPath = joinRelPath(currentPath, entry.name)
    void window.electronAPI.openPreviewWindow({
      url: `${previewBaseUrl}/api/download?path=${encodeURIComponent(relPath)}`,
      name: entry.name
    })
  }

  async function handleSaveMetadata(entryName: string, patch: Partial<EntryMetadata>): Promise<void> {
    if (!selectedPeerId) return
    const updated = await window.electronAPI.setEntryMetadata(selectedPeerId, joinRelPath(currentPath, entryName), patch)
    upsertEntryMetadata(entryName, updated)
  }

  async function handleSetDownloadFolderOverride(label: string): Promise<void> {
    const updated = await window.electronAPI.chooseDownloadFolderOverride(label)
    setSettings(updated)
  }

  async function handleRemoveDownloadFolderOverride(label: string): Promise<void> {
    const updated = await window.electronAPI.removeDownloadFolderOverride(label)
    setSettings(updated)
  }

  async function handleChangeSortMode(mode: SortMode): Promise<void> {
    const updated = await window.electronAPI.setSortMode(mode)
    setSettings(updated)
  }

  async function handleMoveEntry(name: string, direction: 'up' | 'down'): Promise<void> {
    if (!selectedPeerId) return
    const order = effectiveManualOrder(entries, customOrder)
    const nextOrder = moveNameInOrder(order, name, direction)
    const saved = await window.electronAPI.setCustomOrder(selectedPeerId, currentPath, nextOrder)
    setCustomOrderState(saved)
  }

  async function handleReorderEntries(draggedName: string, targetName: string, after: boolean): Promise<void> {
    if (!selectedPeerId || draggedName === targetName) return
    const order = effectiveManualOrder(entries, customOrder)
    const nextOrder = moveNameRelativeTo(order, draggedName, targetName, after)
    const saved = await window.electronAPI.setCustomOrder(selectedPeerId, currentPath, nextOrder)
    setCustomOrderState(saved)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>LanDrop</h1>
        <div className="app-header-actions">
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
              currentPath={currentPath}
              entries={entries}
              metadata={entryMetadata}
              downloadFolderOverrides={settings?.downloadFolderOverrides ?? {}}
              isLoading={isLoadingEntries}
              isSelf={isSelf}
              previewBaseUrl={previewBaseUrl}
              accentColor={settings?.accentColor}
              sortMode={settings?.sortMode ?? 'name'}
              customOrder={customOrder}
              onNavigate={setCurrentPath}
              onUploadFiles={handleUploadFiles}
              onCreateFolder={handleCreateFolder}
              onRename={handleRename}
              onDownload={handleDownload}
              onRevealLocal={handleRevealLocal}
              onSaveMetadata={handleSaveMetadata}
              onSetDownloadFolderOverride={handleSetDownloadFolderOverride}
              onRemoveDownloadFolderOverride={handleRemoveDownloadFolderOverride}
              onPreviewEntry={handlePreviewEntry}
              onChangeSortMode={handleChangeSortMode}
              onMoveEntry={handleMoveEntry}
              onReorderEntries={handleReorderEntries}
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
