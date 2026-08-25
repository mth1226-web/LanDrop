import { useEffect, useState } from 'react'
import { useAppStore, joinRelPath } from './store'
import PeerList from './components/PeerList'
import FolderBrowser from './components/FolderBrowser'
import ActivityList from './components/ActivityList'
import SettingsDialog from './components/SettingsDialog'
import UpdateDialog from './components/UpdateDialog'
import FirewallHintBanner from './components/FirewallHintBanner'
import type { BrowseEntry, Peer } from '../../shared/types'

export default function App(): JSX.Element {
  const peers = useAppStore((s) => s.peers)
  const settings = useAppStore((s) => s.settings)
  const activities = useAppStore((s) => s.activities)
  const selectedPeerId = useAppStore((s) => s.selectedPeerId)
  const currentPath = useAppStore((s) => s.currentPath)
  const entries = useAppStore((s) => s.entries)
  const isLoadingEntries = useAppStore((s) => s.isLoadingEntries)
  const updateState = useAppStore((s) => s.updateState)

  const setPeers = useAppStore((s) => s.setPeers)
  const setSettings = useAppStore((s) => s.setSettings)
  const upsertActivity = useAppStore((s) => s.upsertActivity)
  const selectPeer = useAppStore((s) => s.selectPeer)
  const setCurrentPath = useAppStore((s) => s.setCurrentPath)
  const setEntries = useAppStore((s) => s.setEntries)
  const setLoadingEntries = useAppStore((s) => s.setLoadingEntries)
  const setUpdateState = useAppStore((s) => s.setUpdateState)

  const [showSettings, setShowSettings] = useState(false)
  const [showUpdate, setShowUpdate] = useState(false)

  useEffect(() => {
    window.electronAPI.getPeers().then(setPeers)
    window.electronAPI.getSettings().then(setSettings)
    const unsubscribePeers = window.electronAPI.onPeersChanged(setPeers)
    const unsubscribeActivity = window.electronAPI.onActivityUpdated(upsertActivity)
    const unsubscribeUploaded = window.electronAPI.onPeerUploaded(() => reloadEntries())
    const unsubscribeUpdate = window.electronAPI.onUpdateState(setUpdateState)
    void window.electronAPI.checkForUpdate()
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
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoadingEntries(false))
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

  function handleDownload(entry: BrowseEntry): void {
    if (!selectedPeerId) return
    void window.electronAPI.downloadFile(selectedPeerId, joinRelPath(currentPath, entry.name), entry.name, entry.size)
  }

  function handleRevealLocal(entry: BrowseEntry): void {
    void window.electronAPI.revealLocalFile(joinRelPath(currentPath, entry.name))
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
              isLoading={isLoadingEntries}
              isSelf={isSelf}
              onNavigate={setCurrentPath}
              onUploadFiles={handleUploadFiles}
              onCreateFolder={handleCreateFolder}
              onRename={handleRename}
              onDownload={handleDownload}
              onRevealLocal={handleRevealLocal}
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
    </div>
  )
}
