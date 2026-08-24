import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppSettings, Peer, TransferOfferDecision, TransferSession } from '../shared/types'

contextBridge.exposeInMainWorld('electronAPI', {
  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  getPeers: (): Promise<Peer[]> => ipcRenderer.invoke('get-peers'),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('get-settings'),
  setSettings: (settings: Pick<AppSettings, 'deviceName' | 'saveFolder'>): Promise<AppSettings> =>
    ipcRenderer.invoke('set-settings', settings),
  chooseSaveFolder: (): Promise<string | null> => ipcRenderer.invoke('choose-save-folder'),
  openSaveFolder: (): Promise<void> => ipcRenderer.invoke('open-save-folder'),

  sendFiles: (peerDeviceId: string, filePaths: string[]): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('send-files', { peerDeviceId, filePaths }),
  respondToOffer: (transferId: string, decision: TransferOfferDecision): Promise<void> =>
    ipcRenderer.invoke('respond-to-offer', { transferId, decision }),

  onPeersChanged: (callback: (peers: Peer[]) => void) => {
    const handler = (_: unknown, peers: Peer[]): void => callback(peers)
    ipcRenderer.on('peers-changed', handler)
    return () => ipcRenderer.removeListener('peers-changed', handler)
  },
  onTransferSessionUpdated: (callback: (session: TransferSession) => void) => {
    const handler = (_: unknown, session: TransferSession): void => callback(session)
    ipcRenderer.on('transfer-session-updated', handler)
    return () => ipcRenderer.removeListener('transfer-session-updated', handler)
  }
})
