import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  AppSettings,
  BrowseEntry,
  ChatMessage,
  EntryMetadata,
  EntryOpResult,
  NetworkInterfaceOption,
  PasteMode,
  Peer,
  PreviewSource,
  SortMode,
  TransferActivity,
  UpdateState,
  ViewMode
} from '../shared/types'

contextBridge.exposeInMainWorld('electronAPI', {
  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  getPeers: (): Promise<Peer[]> => ipcRenderer.invoke('get-peers'),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('get-settings'),
  setSettings: (settings: { deviceName: string }): Promise<AppSettings> => ipcRenderer.invoke('set-settings', settings),
  setAccentColor: (color: string): Promise<AppSettings> => ipcRenderer.invoke('set-accent-color', color),
  setSortMode: (mode: SortMode): Promise<AppSettings> => ipcRenderer.invoke('set-sort-mode', mode),
  setViewMode: (mode: ViewMode): Promise<AppSettings> => ipcRenderer.invoke('set-view-mode', mode),
  showEntryContextMenu: (items: { id: string; label: string; disabled?: boolean }[]): Promise<string | null> =>
    ipcRenderer.invoke('show-entry-context-menu', items),
  getCustomOrder: (peerDeviceId: string, relPath: string): Promise<string[]> =>
    ipcRenderer.invoke('get-custom-order', { peerDeviceId, relPath }),
  setCustomOrder: (peerDeviceId: string, relPath: string, order: string[]): Promise<string[]> =>
    ipcRenderer.invoke('set-custom-order', { peerDeviceId, relPath, order }),
  chooseSharedFolder: (): Promise<AppSettings | null> => ipcRenderer.invoke('choose-shared-folder'),
  addSharedFolders: (paths: string[]): Promise<AppSettings> => ipcRenderer.invoke('add-shared-folders', paths),
  removeSharedFolder: (folderPath: string): Promise<AppSettings> => ipcRenderer.invoke('remove-shared-folder', folderPath),
  chooseDownloadFolder: (): Promise<AppSettings | null> => ipcRenderer.invoke('choose-download-folder'),
  openFolder: (folderPath: string): Promise<void> => ipcRenderer.invoke('open-folder', folderPath),
  revealLocalFile: (relPath: string): Promise<void> => ipcRenderer.invoke('reveal-local-file', { relPath }),

  browseFolder: (peerDeviceId: string, relPath: string): Promise<BrowseEntry[]> =>
    ipcRenderer.invoke('browse-folder', { peerDeviceId, relPath }),
  createFolder: (peerDeviceId: string, relPath: string, name: string): Promise<void> =>
    ipcRenderer.invoke('create-folder', { peerDeviceId, relPath, name }),
  renameEntry: (peerDeviceId: string, relPath: string, oldName: string, newName: string): Promise<void> =>
    ipcRenderer.invoke('rename-entry', { peerDeviceId, relPath, oldName, newName }),
  uploadFiles: (peerDeviceId: string, relPath: string, filePaths: string[]): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('upload-files', { peerDeviceId, relPath, filePaths }),
  downloadFile: (peerDeviceId: string, relPath: string, fileName: string, size: number): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('download-file', { peerDeviceId, relPath, fileName, size }),
  downloadEntries: (peerDeviceId: string, relPath: string, entries: BrowseEntry[]): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('download-entries', { peerDeviceId, relPath, entries }),
  pasteEntries: (
    peerDeviceId: string,
    srcRelPath: string,
    destRelPath: string,
    entries: BrowseEntry[],
    mode: PasteMode
  ): Promise<EntryOpResult[]> =>
    ipcRenderer.invoke('paste-entries', { peerDeviceId, srcRelPath, destRelPath, entries, mode }),
  trashEntries: (peerDeviceId: string, relPath: string, names: string[]): Promise<EntryOpResult[]> =>
    ipcRenderer.invoke('trash-entries', { peerDeviceId, relPath, names }),
  compressEntries: (peerDeviceId: string, relPath: string, names: string[]): Promise<{ ok: boolean; name?: string; error?: string }> =>
    ipcRenderer.invoke('compress-entries', { peerDeviceId, relPath, names }),
  extractEntry: (peerDeviceId: string, relPath: string, name: string): Promise<{ ok: boolean; name?: string; error?: string }> =>
    ipcRenderer.invoke('extract-entry', { peerDeviceId, relPath, name }),

  checkForUpdate: (): Promise<void> => ipcRenderer.invoke('check-for-update'),
  applyUpdate: (): Promise<void> => ipcRenderer.invoke('apply-update'),

  openSettingsWindow: (): Promise<void> => ipcRenderer.invoke('open-settings-window'),
  openChatWindow: (): Promise<void> => ipcRenderer.invoke('open-chat-window'),
  openUpdateWindow: (): Promise<void> => ipcRenderer.invoke('open-update-window'),
  openPreviewWindow: (source: PreviewSource | null): Promise<void> => ipcRenderer.invoke('open-preview-window', source),
  openBrowseWindow: (peerDeviceId: string, path: string): Promise<void> =>
    ipcRenderer.invoke('open-browse-window', { peerDeviceId, path }),
  getSharedFolderLabels: (): Promise<{ label: string; path: string }[]> =>
    ipcRenderer.invoke('get-shared-folder-labels'),
  hasDesktopShortcut: (label: string): Promise<boolean> => ipcRenderer.invoke('has-desktop-shortcut', label),
  createDesktopShortcut: (label: string, folderPath: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('create-desktop-shortcut', { label, folderPath }),
  removeDesktopShortcut: (label: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('remove-desktop-shortcut', label),
  getLanUrl: (): Promise<string | null> => ipcRenderer.invoke('get-lan-url'),
  resolveAbsolutePath: (peerDeviceId: string, relPath: string): Promise<string | null> =>
    ipcRenderer.invoke('resolve-absolute-path', { peerDeviceId, relPath }),
  getOwnPreviewBaseUrl: (): Promise<string | null> => ipcRenderer.invoke('get-own-preview-base-url'),
  listNetworkInterfaces: (): Promise<NetworkInterfaceOption[]> => ipcRenderer.invoke('list-network-interfaces'),
  setPreferredNetworkInterface: (name: string | null): Promise<AppSettings> =>
    ipcRenderer.invoke('set-preferred-network-interface', name),
  openNetworkSettings: (): Promise<void> => ipcRenderer.invoke('open-network-settings'),

  getEntryMetadataForChildren: (
    peerDeviceId: string,
    parentRelPath: string,
    childNames: string[]
  ): Promise<Record<string, EntryMetadata>> =>
    ipcRenderer.invoke('get-entry-metadata-for-children', { peerDeviceId, parentRelPath, childNames }),
  setEntryMetadata: (peerDeviceId: string, relPath: string, patch: Partial<EntryMetadata>): Promise<EntryMetadata> =>
    ipcRenderer.invoke('set-entry-metadata', { peerDeviceId, relPath, patch }),

  chooseDownloadFolderOverride: (label: string): Promise<AppSettings> =>
    ipcRenderer.invoke('choose-download-folder-override', label),
  removeDownloadFolderOverride: (label: string): Promise<AppSettings> =>
    ipcRenderer.invoke('remove-download-folder-override', label),

  startDrag: (relPath: string): void => ipcRenderer.send('start-drag', relPath),

  getChatLog: (target: string): Promise<ChatMessage[]> => ipcRenderer.invoke('get-chat-log', target),
  sendChatMessage: (target: string, text: string): Promise<ChatMessage> =>
    ipcRenderer.invoke('send-chat-message', { target, text }),
  clearChatLog: (target: string): Promise<void> => ipcRenderer.invoke('clear-chat-log', target),

  onPeersChanged: (callback: (peers: Peer[]) => void) => {
    const handler = (_: unknown, peers: Peer[]): void => callback(peers)
    ipcRenderer.on('peers-changed', handler)
    return () => ipcRenderer.removeListener('peers-changed', handler)
  },
  onActivityUpdated: (callback: (activity: TransferActivity) => void) => {
    const handler = (_: unknown, activity: TransferActivity): void => callback(activity)
    ipcRenderer.on('activity-updated', handler)
    return () => ipcRenderer.removeListener('activity-updated', handler)
  },
  onPeerUploaded: (callback: () => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('peer-uploaded', handler)
    return () => ipcRenderer.removeListener('peer-uploaded', handler)
  },
  onUpdateState: (callback: (state: UpdateState) => void) => {
    const handler = (_: unknown, state: UpdateState): void => callback(state)
    ipcRenderer.on('update-state', handler)
    return () => ipcRenderer.removeListener('update-state', handler)
  },
  onChatMessage: (callback: (payload: { target: string; message: ChatMessage }) => void) => {
    const handler = (_: unknown, payload: { target: string; message: ChatMessage }): void => callback(payload)
    ipcRenderer.on('chat-message', handler)
    return () => ipcRenderer.removeListener('chat-message', handler)
  },
  onSettingsChanged: (callback: (settings: AppSettings) => void) => {
    const handler = (_: unknown, settings: AppSettings): void => callback(settings)
    ipcRenderer.on('settings-changed', handler)
    return () => ipcRenderer.removeListener('settings-changed', handler)
  },
  onPreviewSource: (callback: (source: PreviewSource) => void) => {
    const handler = (_: unknown, source: PreviewSource): void => callback(source)
    ipcRenderer.on('preview-source', handler)
    return () => ipcRenderer.removeListener('preview-source', handler)
  },
  onOpenFolderPath: (callback: (relPath: string) => void) => {
    const handler = (_: unknown, relPath: string): void => callback(relPath)
    ipcRenderer.on('open-folder-path', handler)
    return () => ipcRenderer.removeListener('open-folder-path', handler)
  }
})
