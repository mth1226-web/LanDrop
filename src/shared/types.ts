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
  /** MacのFinderカラータグの色(16進)。Mac上のファイルでタグが付いている場合のみ。それ以外はnull */
  finderTagColor: string | null
}

/**
 * MacのFinderカラータグの色番号(1〜7) -> 16進カラーコード。
 * main(finderTags.ts)とrenderer(色ピッカー)の両方から同じ値を参照する。要実機確認。
 */
export const FINDER_TAG_COLORS: Record<number, string> = {
  1: '#8E8E93', // グレー
  2: '#63C93E', // グリーン
  3: '#B15DFA', // パープル
  4: '#3F84F1', // ブルー
  5: '#FFD426', // イエロー
  6: '#FC3B32', // レッド
  7: '#FF9600' // オレンジ
}

export type PasteMode = 'copy' | 'move'

/** コピー/移動/ごみ箱移動を複数件まとめて実行した際の、1件ごとの結果 */
export interface EntryOpResult {
  name: string
  ok: boolean
  error?: string
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

/** Windowsエクスプローラ相当の8種類 + Mac Finderのカラム表示 */
export type ViewMode =
  | 'extraLargeIcons'
  | 'largeIcons'
  | 'mediumIcons'
  | 'smallIcons'
  | 'list'
  | 'details'
  | 'tiles'
  | 'content'
  | 'columns'

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
  viewMode: ViewMode
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

export interface PreviewSource {
  url: string
  name: string
}
