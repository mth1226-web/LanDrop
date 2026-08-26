// チャットログの読み書き（Electron非依存、fs/pathのみ使用）
// ユーザーが明示的に削除するまで消えない永続ログ。全体チャットと個別(相手deviceIdごと)チャットを分けて保持する
import fs from 'node:fs'
import path from 'node:path'
import type { ChatMessage } from '../shared/types'

export interface ChatStore {
  broadcast: ChatMessage[]
  direct: Record<string, ChatMessage[]>
}

export const EMPTY_CHAT_STORE: ChatStore = { broadcast: [], direct: {} }

export function loadChatStore(filePath: string): ChatStore {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<ChatStore>
    return {
      broadcast: Array.isArray(parsed.broadcast) ? parsed.broadcast : [],
      direct: typeof parsed.direct === 'object' && parsed.direct !== null ? parsed.direct : {}
    }
  } catch {
    return { broadcast: [], direct: {} }
  }
}

export function saveChatStore(filePath: string, store: ChatStore): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8')
}

/** 既に同じidのメッセージがあれば追加しない(重複防止) */
export function appendBroadcastMessage(store: ChatStore, message: ChatMessage): ChatStore {
  if (store.broadcast.some((m) => m.id === message.id)) return store
  return { ...store, broadcast: [...store.broadcast, message] }
}

export function appendDirectMessage(store: ChatStore, peerDeviceId: string, message: ChatMessage): ChatStore {
  const existing = store.direct[peerDeviceId] ?? []
  if (existing.some((m) => m.id === message.id)) return store
  return { ...store, direct: { ...store.direct, [peerDeviceId]: [...existing, message] } }
}

export function clearBroadcastLog(store: ChatStore): ChatStore {
  return { ...store, broadcast: [] }
}

export function clearDirectLog(store: ChatStore, peerDeviceId: string): ChatStore {
  const next = { ...store.direct }
  delete next[peerDeviceId]
  return { ...store, direct: next }
}

export function getBroadcastLog(store: ChatStore): ChatMessage[] {
  return store.broadcast
}

export function getDirectLog(store: ChatStore, peerDeviceId: string): ChatMessage[] {
  return store.direct[peerDeviceId] ?? []
}
