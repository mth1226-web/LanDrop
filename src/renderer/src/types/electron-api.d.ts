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
} from '../../../shared/types'

export interface ElectronAPI {
  getPathForFile: (file: File) => string

  getPeers: () => Promise<Peer[]>
  getSettings: () => Promise<AppSettings>
  setSettings: (settings: { deviceName: string }) => Promise<AppSettings>
  setAccentColor: (color: string) => Promise<AppSettings>
  setSortMode: (mode: SortMode) => Promise<AppSettings>
  setViewMode: (mode: ViewMode) => Promise<AppSettings>
  showEntryContextMenu: (items: { id: string; label: string; disabled?: boolean }[]) => Promise<string | null>
  getCustomOrder: (peerDeviceId: string, relPath: string) => Promise<string[]>
  setCustomOrder: (peerDeviceId: string, relPath: string, order: string[]) => Promise<string[]>
  chooseSharedFolder: () => Promise<AppSettings | null>
  addSharedFolders: (paths: string[]) => Promise<AppSettings>
  removeSharedFolder: (folderPath: string) => Promise<AppSettings>
  chooseDownloadFolder: () => Promise<AppSettings | null>
  openFolder: (folderPath: string) => Promise<void>
  revealLocalFile: (relPath: string) => Promise<void>

  browseFolder: (peerDeviceId: string, relPath: string) => Promise<BrowseEntry[]>
  createFolder: (peerDeviceId: string, relPath: string, name: string) => Promise<void>
  renameEntry: (peerDeviceId: string, relPath: string, oldName: string, newName: string) => Promise<void>
  uploadFiles: (peerDeviceId: string, relPath: string, filePaths: string[]) => Promise<{ ok: boolean; error?: string }>
  downloadFile: (peerDeviceId: string, relPath: string, fileName: string, size: number) => Promise<{ ok: boolean }>
  downloadEntries: (peerDeviceId: string, relPath: string, entries: BrowseEntry[]) => Promise<{ ok: boolean }>
  pasteEntries: (
    peerDeviceId: string,
    srcRelPath: string,
    destRelPath: string,
    entries: BrowseEntry[],
    mode: PasteMode
  ) => Promise<EntryOpResult[]>
  trashEntries: (peerDeviceId: string, relPath: string, names: string[]) => Promise<EntryOpResult[]>
  compressEntries: (peerDeviceId: string, relPath: string, names: string[]) => Promise<{ ok: boolean; name?: string; error?: string }>
  extractEntry: (peerDeviceId: string, relPath: string, name: string) => Promise<{ ok: boolean; name?: string; error?: string }>

  checkForUpdate: () => Promise<void>
  applyUpdate: () => Promise<void>
  openSettingsWindow: () => Promise<void>
  openChatWindow: () => Promise<void>
  openUpdateWindow: () => Promise<void>
  openPreviewWindow: (source: PreviewSource | null) => Promise<void>
  openBrowseWindow: (peerDeviceId: string, path: string) => Promise<void>
  getLanUrl: () => Promise<string | null>
  getOwnPreviewBaseUrl: () => Promise<string | null>
  listNetworkInterfaces: () => Promise<NetworkInterfaceOption[]>
  setPreferredNetworkInterface: (name: string | null) => Promise<AppSettings>
  openNetworkSettings: () => Promise<void>

  getEntryMetadataForChildren: (
    peerDeviceId: string,
    parentRelPath: string,
    childNames: string[]
  ) => Promise<Record<string, EntryMetadata>>
  setEntryMetadata: (peerDeviceId: string, relPath: string, patch: Partial<EntryMetadata>) => Promise<EntryMetadata>

  chooseDownloadFolderOverride: (label: string) => Promise<AppSettings>
  removeDownloadFolderOverride: (label: string) => Promise<AppSettings>

  startDrag: (relPath: string) => void

  getChatLog: (target: string) => Promise<ChatMessage[]>
  sendChatMessage: (target: string, text: string) => Promise<ChatMessage>
  clearChatLog: (target: string) => Promise<void>

  onPeersChanged: (callback: (peers: Peer[]) => void) => () => void
  onActivityUpdated: (callback: (activity: TransferActivity) => void) => () => void
  onPeerUploaded: (callback: () => void) => () => void
  onUpdateState: (callback: (state: UpdateState) => void) => () => void
  onChatMessage: (callback: (payload: { target: string; message: ChatMessage }) => void) => () => void
  onSettingsChanged: (callback: (settings: AppSettings) => void) => () => void
  onPreviewSource: (callback: (source: PreviewSource) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
