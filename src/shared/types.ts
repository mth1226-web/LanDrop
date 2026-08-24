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

export interface BrowseEntry {
  name: string
  isDirectory: boolean
  size: number
  modifiedAt: number
}

export type ActivityDirection = 'upload' | 'download'
export type ActivityStatus = 'in_progress' | 'completed' | 'failed'

export interface TransferActivity {
  id: string
  direction: ActivityDirection
  peerDeviceId: string
  peerDeviceName: string
  fileName: string
  transferredBytes: number
  totalBytes: number
  status: ActivityStatus
  createdAt: number
  errorMessage?: string
}

export interface AppSettings {
  deviceId: string
  deviceName: string
  sharedFolders: string[]
  downloadFolder: string
}
