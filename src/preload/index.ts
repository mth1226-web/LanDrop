import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppSettings, BrowseEntry, Peer, TransferActivity } from '../shared/types'

contextBridge.exposeInMainWorld('electronAPI', {
  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  getPeers: (): Promise<Peer[]> => ipcRenderer.invoke('get-peers'),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('get-settings'),
  setSettings: (settings: { deviceName: string }): Promise<AppSettings> => ipcRenderer.invoke('set-settings', settings),
  chooseSharedFolder: (): Promise<AppSettings | null> => ipcRenderer.invoke('choose-shared-folder'),
  chooseDownloadFolder: (): Promise<AppSettings | null> => ipcRenderer.invoke('choose-download-folder'),
  openSharedFolder: (): Promise<void> => ipcRenderer.invoke('open-shared-folder'),
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
  }
})
