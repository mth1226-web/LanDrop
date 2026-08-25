import type { AppSettings, BrowseEntry, Peer, TransferActivity, UpdateState } from '../../../shared/types'

export interface ElectronAPI {
  getPathForFile: (file: File) => string

  getPeers: () => Promise<Peer[]>
  getSettings: () => Promise<AppSettings>
  setSettings: (settings: { deviceName: string }) => Promise<AppSettings>
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

  checkForUpdate: () => Promise<void>
  applyUpdate: () => Promise<void>

  onPeersChanged: (callback: (peers: Peer[]) => void) => () => void
  onActivityUpdated: (callback: (activity: TransferActivity) => void) => () => void
  onPeerUploaded: (callback: () => void) => () => void
  onUpdateState: (callback: (state: UpdateState) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
