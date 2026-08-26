import { useEffect, useState } from 'react'
import { useAppStore, joinRelPath } from './store'
import PeerList from './components/PeerList'
import FolderBrowser from './components/FolderBrowser'
import ActivityList from './components/ActivityList'
import SettingsDialog from './components/SettingsDialog'
import UpdateDialog from './components/UpdateDialog'
import ChatDialog from './components/ChatDialog'
import PreviewDialog from './components/PreviewDialog'
import type { PreviewSource } from './components/PreviewDialog'
import FirewallHintBanner from './components/FirewallHintBanner'
import type { BrowseEntry, EntryMetadata, Peer, SortMode } from '../../shared/types'
import { effectiveManualOrder, moveNameInOrder } from './utils/sortEntries'

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

  const [showSettings, setShowSettings] = useState(false)
  const [showUpdate, setShowUpdate] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewSource, setPreviewSource] = useState<PreviewSource | null>(null)
  const [ownPreviewBaseUrl, setOwnPreviewBaseUrl] = useState<string | null>(null)
  const [customOrder, setCustomOrderState] = useState<string[]>([])

  useEffect(() => {
    window.electronAPI.getPeers().then(setPeers)
    window.electronAPI.getSettings().then(setSettings)
    const unsubscribePeers = window.electronAPI.onPeersChanged(setPeers)
    const unsubscribeActivity = window.electronAPI.onActivityUpdated(upsertActivity)
    const unsubscribeUploaded = window.electronAPI.onPeerUploaded(() => reloadEntries())
    const unsubscribeUpdate = window.electronAPI.onUpdateState(setUpdateState)
    void window.electronAPI.checkForUpdate()
    window.electronAPI.getOwnPreviewBaseUrl().then(setOwnPreviewBaseUrl)
    return () => {
      unsubscribePeers()
      unsubscribeActivity()
      unsubscribeUploaded()
      unsubscribeUpdate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (settings && !selectedPeerId) selectPeer(settings.deviceId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])

  useEffect(() => {
    reloadEntries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeerId, currentPath])

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
    setPreviewSource({ url: `${previewBaseUrl}/api/download?path=${encodeURIComponent(relPath)}`, name: entry.name })
    setShowPreview(true)
  }

  function handleShowLocalPreviewFile(file: File): void {
    setPreviewSource({ url: URL.createObjectURL(file), name: file.name })
  }

  async function handleSaveDeviceName(deviceName: string): Promise<void> {
    const updated = await window.electronAPI.setSettings({ deviceName })
    setSettings(updated)
  }

  async function handleChooseSharedFolder(): Promise<void> {
    const updated = await window.electronAPI.chooseSharedFolder()
    if (updated) {
      setSettings(updated)
      reloadEntries()
    }
  }

  async function handleAddSharedFolders(paths: string[]): Promise<void> {
    const updated = await window.electronAPI.addSharedFolders(paths)
    setSettings(updated)
    reloadEntries()
  }

  async function handleRemoveSharedFolder(folderPath: string): Promise<void> {
    const updated = await window.electronAPI.removeSharedFolder(folderPath)
    setSettings(updated)
    reloadEntries()
  }

  function handleOpenFolder(folderPath: string): void {
    void window.electronAPI.openFolder(folderPath)
  }

  async function handleChooseDownloadFolder(): Promise<void> {
    const updated = await window.electronAPI.chooseDownloadFolder()
    if (updated) setSettings(updated)
  }

  async function handleChangeAccentColor(color: string): Promise<void> {
    const updated = await window.electronAPI.setAccentColor(color)
    setSettings(updated)
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

  function handleCheckForUpdate(): void {
    void window.electronAPI.checkForUpdate()
  }

  function handleApplyUpdate(): void {
    void window.electronAPI.applyUpdate()
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>LanDrop</h1>
        <div className="app-header-actions">
          <button className="button secondary" onClick={() => setShowPreview(true)}>
            プレビュー
          </button>
          <button className="button secondary" onClick={() => setShowChat(true)}>
            チャット
          </button>
          <button className="button secondary" onClick={() => setShowUpdate(true)}>
            アップデート{updateState.phase === 'available' && <span className="update-dot" />}
          </button>
          <button className="button secondary" onClick={() => setShowSettings(true)}>
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
            />
          ) : (
            <div className="panel folder-browser">
              <p className="empty-hint">左のPC一覧から見たい端末を選んでください</p>
            </div>
          )}
          <ActivityList activities={activityList} />
        </div>
      </main>

      {showSettings && settings && (
        <SettingsDialog
          settings={settings}
          onSaveDeviceName={handleSaveDeviceName}
          onAddSharedFolders={handleAddSharedFolders}
          onChooseSharedFolder={handleChooseSharedFolder}
          onRemoveSharedFolder={handleRemoveSharedFolder}
          onOpenFolder={handleOpenFolder}
          onChooseDownloadFolder={handleChooseDownloadFolder}
          onChangeAccentColor={handleChangeAccentColor}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showUpdate && (
        <UpdateDialog
          updateState={updateState}
          onCheck={handleCheckForUpdate}
          onApply={handleApplyUpdate}
          onClose={() => setShowUpdate(false)}
        />
      )}

      {showChat && settings && (
        <ChatDialog
          peers={peers}
          selfDeviceId={settings.deviceId}
          selfDeviceName={settings.deviceName}
          onClose={() => setShowChat(false)}
        />
      )}

      {showPreview && (
        <PreviewDialog
          source={previewSource}
          onShowLocalFile={handleShowLocalPreviewFile}
          onClose={() => {
            setShowPreview(false)
            setPreviewSource(null)
          }}
        />
      )}
    </div>
  )
}
