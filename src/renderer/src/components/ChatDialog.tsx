import { useEffect, useRef, useState } from 'react'
import type { ChatMessage, Peer } from '../../../shared/types'

interface Props {
  peers: Peer[]
  selfDeviceId: string
  selfDeviceName: string
  onClose: () => void
}

interface ChatTargetOption {
  id: string
  name: string
}

export default function ChatDialog({ peers, selfDeviceId, selfDeviceName, onClose }: Props): JSX.Element {
  const [activeTarget, setActiveTarget] = useState('broadcast')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const messagesRef = useRef<HTMLDivElement>(null)

  const targets: ChatTargetOption[] = [
    { id: 'broadcast', name: '全体' },
    ...peers.filter((p) => p.deviceId !== selfDeviceId).map((p) => ({ id: p.deviceId, name: p.deviceName }))
  ]
  const activeTargetName = targets.find((t) => t.id === activeTarget)?.name ?? activeTarget

  useEffect(() => {
    window.electronAPI.getChatLog(activeTarget).then(setMessages)
  }, [activeTarget])

  useEffect(() => {
    return window.electronAPI.onChatMessage(({ target, message }) => {
      if (target !== activeTarget) return
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]))
    })
  }, [activeTarget])

  useEffect(() => {
    const el = messagesRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  async function handleSend(): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed) return
    setText('')
    const message = await window.electronAPI.sendChatMessage(activeTarget, trimmed)
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]))
  }

  async function handleClearLog(): Promise<void> {
    if (!window.confirm(`「${activeTargetName}」のログを削除しますか？この操作は取り消せません。`)) return
    await window.electronAPI.clearChatLog(activeTarget)
    setMessages([])
  }

  return (
    <div className="modal-overlay">
      <div className="modal chat-dialog">
        <h2>チャット</h2>
        <div className="chat-dialog-body">
          <div className="chat-target-list">
            {targets.map((t) => (
              <button
                key={t.id}
                className={t.id === activeTarget ? 'chat-target-item selected' : 'chat-target-item'}
                onClick={() => setActiveTarget(t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>
          <div className="chat-main">
            <div className="chat-main-header">
              <span>{activeTargetName}</span>
              <button className="button secondary small" onClick={() => void handleClearLog()}>
                ログを削除
              </button>
            </div>
            <div className="chat-messages" ref={messagesRef}>
              {messages.length === 0 && <p className="empty-hint">まだメッセージはありません</p>}
              {messages.map((m) => {
                const mine = m.fromDeviceId === selfDeviceId
                return (
                  <div key={m.id} className={mine ? 'chat-bubble mine' : 'chat-bubble'}>
                    <div className="chat-bubble-meta">
                      {mine ? selfDeviceName : m.fromDeviceName} ・{' '}
                      {new Date(m.timestamp).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="chat-bubble-text">{m.text}</div>
                  </div>
                )
              })}
            </div>
            <form
              className="chat-input-row"
              onSubmit={(e) => {
                e.preventDefault()
                void handleSend()
              }}
            >
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={500}
                placeholder={`${activeTargetName}にメッセージを送る`}
              />
              <button type="submit" className="button primary" disabled={!text.trim()}>
                送信
              </button>
            </form>
          </div>
        </div>
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}
