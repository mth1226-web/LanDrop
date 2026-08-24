import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { AppSettings, Peer, TransferSession } from '../../../shared/types'

interface AppState {
  peers: Peer[]
  sessions: Record<string, TransferSession>
  settings: AppSettings | null
  setPeers: (peers: Peer[]) => void
  upsertSession: (session: TransferSession) => void
  setSettings: (settings: AppSettings) => void
}

export const useAppStore = create<AppState>()(
  immer((set) => ({
    peers: [],
    sessions: {},
    settings: null,
    setPeers: (peers) =>
      set((s) => {
        s.peers = peers
      }),
    upsertSession: (session) =>
      set((s) => {
        s.sessions[session.transferId] = session
      }),
    setSettings: (settings) =>
      set((s) => {
        s.settings = settings
      })
  }))
)
