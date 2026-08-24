// LanDrop共通の型定義（main/preload/rendererすべてから参照される）

export interface Peer {
  deviceId: string
  deviceName: string
  address: string
  httpPort: number
  lastSeenAt: number
}

export interface DeviceAnnounce {
  type: 'announce'
  deviceId: string
  deviceName: string
  httpPort: number
}

export interface DeviceGoodbye {
  type: 'goodbye'
  deviceId: string
}

export type DiscoveryMessage = DeviceAnnounce | DeviceGoodbye

export interface FileMeta {
  fileId: string
  name: string
  size: number
  mimeType: string
}

export interface TransferOffer {
  transferId: string
  fromDeviceId: string
  fromDeviceName: string
  fromHttpPort: number
  files: FileMeta[]
}

export type TransferOfferDecision = 'accepted' | 'rejected'

export interface TransferOfferResponse {
  transferId: string
  decision: TransferOfferDecision
}

export type TransferDirection = 'outgoing' | 'incoming'

export type TransferStatus =
  | 'offered'
  | 'accepted'
  | 'rejected'
  | 'timeout'
  | 'in_progress'
  | 'completed'
  | 'failed'

export interface TransferFileProgress {
  fileId: string
  transferredBytes: number
  totalBytes: number
}

export interface TransferSession {
  transferId: string
  direction: TransferDirection
  peerDeviceId: string
  peerDeviceName: string
  files: FileMeta[]
  status: TransferStatus
  createdAt: number
  fileProgress: Record<string, TransferFileProgress>
  errorMessage?: string
}

export interface AppSettings {
  deviceId: string
  deviceName: string
  saveFolder: string
}
