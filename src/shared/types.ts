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

export interface ChatBroadcastMessage {
  type: 'chat'
  id: string
  fromDeviceId: string
  fromDeviceName: string
  text: string
  timestamp: number
}

export type DiscoveryMessage = DeviceAnnounce | DeviceGoodbye | ChatBroadcastMessage

export interface ChatMessage {
  id: string
  fromDeviceId: string
  fromDeviceName: string
  text: string
  timestamp: number
}

/** チャットの相手先。'broadcast' = 全体チャット、それ以外は相手のdeviceId(個別チャット) */
export type ChatTarget = string

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

export type SortMode = 'name' | 'date' | 'manual'

export interface AppSettings {
  deviceId: string
  deviceName: string
  sharedFolders: string[]
  downloadFolder: string
  accentColor: string
  preferredNetworkInterface: string | null
  /** 共有フォルダのラベル(ルート直下のフォルダ名) -> ダウンロード先の個別設定 */
  downloadFolderOverrides: Record<string, string>
  sortMode: SortMode
}

export interface NetworkInterfaceOption {
  name: string
  address: string
}

/** ファイル/フォルダごとのローカルな整理情報（自分のPC内だけのメモ。相手のファイル自体は変更しない） */
export interface EntryMetadata {
  hidden: boolean
  color: string | null
  memo: string
  imported: boolean
}

export const DEFAULT_ENTRY_METADATA: EntryMetadata = {
  hidden: false,
  color: null,
  memo: '',
  imported: false
}

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'error'
  | 'unsupported-platform'

export interface UpdateState {
  phase: UpdatePhase
  percent?: number
  currentVersion?: string
  latestVersion?: string
  errorMessage?: string
}
