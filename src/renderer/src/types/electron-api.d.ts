import type { AppSettings, BrowseEntry, Peer, TransferActivity } from '../../../shared/types'

export interface ElectronAPI {
  getPathForFile: (file: File) => string

  getPeers: () => Promise<Peer[]>
  getSettings: () => Promise<AppSettings>
  setSettings: (settings: { deviceName: string }) => Promise<AppSettings>
  chooseSharedFolder: () => Promise<AppSettings | null>
  chooseDownloadFolder: () => Promise<AppSettings | null>
  openSharedFolder: () => Promise<void>
  revealLocalFile: (relPath: string) => Promise<void>

  browseFolder: (peerDeviceId: string, relPath: string) => Promise<BrowseEntry[]>
  createFolder: (peerDeviceId: string, relPath: string, name: string) => Promise<void>
  renameEntry: (peerDeviceId: string, relPath: string, oldName: string, newName: string) => Promise<void>
  uploadFiles: (peerDeviceId: string, relPath: string, filePaths: string[]) => Promise<{ ok: boolean; error?: string }>
  downloadFile: (peerDeviceId: string, relPath: string, fileName: string, size: number) => Promise<{ ok: boolean }>

  onPeersChanged: (callback: (peers: Peer[]) => void) => () => void
  onActivityUpdated: (callback: (activity: TransferActivity) => void) => () => void
  onPeerUploaded: (callback: () => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
