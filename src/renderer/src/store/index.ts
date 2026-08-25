import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { AppSettings, BrowseEntry, Peer, TransferActivity, UpdateState } from '../../../shared/types'

interface AppState {
  peers: Peer[]
  settings: AppSettings | null
  activities: Record<string, TransferActivity>
  selectedPeerId: string | null
  currentPath: string
  entries: BrowseEntry[]
  isLoadingEntries: boolean
  updateState: UpdateState

  setPeers: (peers: Peer[]) => void
  setSettings: (settings: AppSettings) => void
  upsertActivity: (activity: TransferActivity) => void
  selectPeer: (peerId: string) => void
  setCurrentPath: (path: string) => void
  setEntries: (entries: BrowseEntry[]) => void
  setLoadingEntries: (loading: boolean) => void
  setUpdateState: (state: UpdateState) => void
}

export const useAppStore = create<AppState>()(
  immer((set) => ({
    peers: [],
    settings: null,
    activities: {},
    selectedPeerId: null,
    currentPath: '',
    entries: [],
    isLoadingEntries: false,
    updateState: { phase: 'idle' },

    setPeers: (peers) =>
      set((s) => {
        s.peers = peers
      }),
    setSettings: (settings) =>
      set((s) => {
        s.settings = settings
      }),
    upsertActivity: (activity) =>
      set((s) => {
        s.activities[activity.id] = activity
      }),
    selectPeer: (peerId) =>
      set((s) => {
        s.selectedPeerId = peerId
        s.currentPath = ''
        s.entries = []
      }),
    setCurrentPath: (path) =>
      set((s) => {
        s.currentPath = path
      }),
    setEntries: (entries) =>
      set((s) => {
        s.entries = entries
      }),
    setLoadingEntries: (loading) =>
      set((s) => {
        s.isLoadingEntries = loading
      }),
    setUpdateState: (state) =>
      set((s) => {
        s.updateState = state
      })
  }))
)

export function joinRelPath(basePath: string, name: string): string {
  return basePath ? `${basePath}/${name}` : name
}

export function parentRelPath(currentPath: string): string {
  const segments = currentPath.split('/').filter(Boolean)
  segments.pop()
  return segments.join('/')
}

export function pathSegments(currentPath: string): string[] {
  return currentPath.split('/').filter(Boolean)
}
