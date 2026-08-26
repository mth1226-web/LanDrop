import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  AppSettings,
  BrowseEntry,
  ChatMessage,
  EntryMetadata,
  NetworkInterfaceOption,
  Peer,
  TransferActivity,
  UpdateState
} from '../shared/types'

contextBridge.exposeInMainWorld('electronAPI', {
  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  getPeers: (): Promise<Peer[]> => ipcRenderer.invoke('get-peers'),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('get-settings'),
  setSettings: (settings: { deviceName: string }): Promise<AppSettings> => ipcRenderer.invoke('set-settings', settings),
  setAccentColor: (color: string): Promise<AppSettings> => ipcRenderer.invoke('set-accent-color', color),
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

  checkForUpdate: (): Promise<void> => ipcRenderer.invoke('check-for-update'),
  applyUpdate: (): Promise<void> => ipcRenderer.invoke('apply-update'),
  getLanUrl: (): Promise<string | null> => ipcRenderer.invoke('get-lan-url'),
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
  }
})
