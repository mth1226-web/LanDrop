import type { AppSettings, Peer, TransferOfferDecision, TransferSession } from '../../../shared/types'

export interface ElectronAPI {
  getPathForFile: (file: File) => string

  getPeers: () => Promise<Peer[]>
  getSettings: () => Promise<AppSettings>
  setSettings: (settings: Pick<AppSettings, 'deviceName' | 'saveFolder'>) => Promise<AppSettings>
  chooseSaveFolder: () => Promise<string | null>
  openSaveFolder: () => Promise<void>

  sendFiles: (peerDeviceId: string, filePaths: string[]) => Promise<{ ok: boolean; error?: string }>
  respondToOffer: (transferId: string, decision: TransferOfferDecision) => Promise<void>

  onPeersChanged: (callback: (peers: Peer[]) => void) => () => void
  onTransferSessionUpdated: (callback: (session: TransferSession) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
