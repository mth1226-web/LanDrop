import { useEffect, useState } from 'react'
import type { BrowseEntry, EntryOpResult, Peer, SyncDirection, SyncPair, SyncPlan, TransferActivity } from '../../../shared/types'
import { formatBytes } from '../utils/format'
import ActivityList from './ActivityList'

interface Props {
  pairs: SyncPair[]
  peers: Peer[]
  selfDeviceId: string
  selfDeviceName: string
  activities: TransferActivity[]
  onSavePair: (pair: SyncPair) => Promise<void>
  onDeletePair: (pairId: string) => Promise<void>
  onChooseLocalFolder: () => Promise<string | null>
  onBrowseRemote: (peerDeviceId: string, relPath: string) => Promise<BrowseEntry[]>
  onCompare: (pairId: string) => Promise<SyncPlan>
  onExecute: (pairId: string) => Promise<EntryOpResult[]>
  onClose: () => void
}

const EMPTY_FORM = (selfDeviceId: string): SyncPair => ({
  id: '',
  name: '',
  localFolder: '',
  remotePeerDeviceId: selfDeviceId,
  remoteFolder: '',
  mode: 'mirror',
  direction: 'push',
  compareBy: 'time-size',
  useVersioning: false
})

export default function SyncView({
  pairs,
  peers,
  selfDeviceId,
  selfDeviceName,
  activities,
  onSavePair,
  onDeletePair,
  onChooseLocalFolder,
  onBrowseRemote,
  onCompare,
  onExecute,
  onClose
}: Props): JSX.Element {
  const [form, setForm] = useState<SyncPair | null>(null)
  const [remoteBrowsePath, setRemoteBrowsePath] = useState('')
  const [remoteEntries, setRemoteEntries] = useState<BrowseEntry[]>([])
  const [activePairId, setActivePairId] = useState<string | null>(null)
  const [plan, setPlan] = useState<SyncPlan | null>(null)
  const [comparing, setComparing] = useState(false)
  const [executing, setExecuting] = useState(false)

  const remotePeerOptions: { deviceId: string; deviceName: string }[] = [
    { deviceId: selfDeviceId, deviceName: `${selfDeviceName}（自分）` },
    ...peers.filter((p) => p.deviceId !== selfDeviceId).map((p) => ({ deviceId: p.deviceId, deviceName: p.deviceName }))
  ]

  useEffect(() => {
    if (!form) return
    setRemoteBrowsePath(form.remoteFolder)
  }, [form?.remotePeerDeviceId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!form) return
    onBrowseRemote(form.remotePeerDeviceId, remoteBrowsePath).then(setRemoteEntries).catch(() => setRemoteEntries([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.remotePeerDeviceId, remoteBrowsePath])

  function startNewPair(): void {
    setForm(EMPTY_FORM(selfDeviceId))
    setRemoteBrowsePath('')
  }

  function startEditPair(pair: SyncPair): void {
    setForm(pair)
    setRemoteBrowsePath(pair.remoteFolder)
  }

  async function handleChooseLocalFolder(): Promise<void> {
    if (!form) return
    const chosen = await onChooseLocalFolder()
    if (chosen) setForm({ ...form, localFolder: chosen })
  }

  async function handleSave(): Promise<void> {
    if (!form) return
    if (!form.name.trim() || !form.localFolder || !form.remoteFolder) {
      window.alert('名前・ローカルフォルダ・リモートフォルダをすべて指定してください')
      return
    }
    await onSavePair(form)
    setForm(null)
  }

  async function handleCompare(pairId: string): Promise<void> {
    setActivePairId(pairId)
    setPlan(null)
    setComparing(true)
    try {
      const result = await onCompare(pairId)
      setPlan(result)
    } catch (err) {
      window.alert(`比較に失敗しました: ${String(err)}`)
    } finally {
      setComparing(false)
    }
  }

  async function handleExecute(pairId: string): Promise<void> {
    if (!plan) return
    if (plan.summary.deletes > 0) {
      const ok = window.confirm(
        `この同期には削除が${plan.summary.deletes}件含まれます。実行すると、対象はごみ箱(またはバージョン退避)へ移動されます。本当に実行しますか？`
      )
      if (!ok) return
    } else if (plan.summary.creates === 0 && plan.summary.updates === 0) {
      window.alert('変更点はありません')
      return
    }
    setExecuting(true)
    try {
      const results = await onExecute(pairId)
      const failed = results.filter((r) => !r.ok)
      if (failed.length > 0) {
        window.alert(`失敗した項目があります:\n${failed.map((f) => `${f.name}: ${f.error ?? ''}`).join('\n')}`)
      }
      setPlan(null)
      setActivePairId(null)
    } catch (err) {
      window.alert(`同期の実行に失敗しました: ${String(err)}`)
    } finally {
      setExecuting(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal sync-dialog">
        <h2>フォルダ同期</h2>
        <p className="sync-hint">
          ソース側の状態にターゲット側を一致させる片方向ミラー同期です。削除・上書きされる対象はごみ箱(またはバージョン退避)へ移動されます。
        </p>

        <ul className="sync-pair-list">
          {pairs.length === 0 && <li className="empty-hint">同期ペアがまだありません</li>}
          {pairs.map((pair) => {
            const peerName = remotePeerOptions.find((p) => p.deviceId === pair.remotePeerDeviceId)?.deviceName ?? '(不明)'
            return (
              <li key={pair.id} className="sync-pair-item">
                <div className="sync-pair-info">
                  <div className="sync-pair-name">{pair.name}</div>
                  <div className="sync-pair-detail">
                    {pair.direction === 'push' ? `${pair.localFolder} → ${peerName}/${pair.remoteFolder}` : `${peerName}/${pair.remoteFolder} → ${pair.localFolder}`}
                  </div>
                </div>
                <div className="sync-pair-actions">
                  <button className="button secondary small" onClick={() => startEditPair(pair)}>
                    編集
                  </button>
                  <button className="button secondary small" onClick={() => void handleCompare(pair.id)} disabled={comparing}>
                    比較
                  </button>
                  <button className="button secondary small" onClick={() => void onDeletePair(pair.id)}>
                    削除
                  </button>
                </div>
              </li>
            )
          })}
        </ul>

        {!form && (
          <button className="button primary" onClick={startNewPair}>
            新しい同期ペアを追加
          </button>
        )}

        {form && (
          <div className="sync-pair-form">
            <h3>{form.id ? '同期ペアを編集' : '新しい同期ペア'}</h3>
            <label className="field">
              <span>名前</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="field">
              <span>ローカルフォルダ</span>
              <div className="folder-row">
                <input value={form.localFolder} readOnly />
                <button className="button secondary" onClick={() => void handleChooseLocalFolder()}>
                  選択
                </button>
              </div>
            </label>
            <label className="field">
              <span>リモートの端末</span>
              <select
                value={form.remotePeerDeviceId}
                onChange={(e) => setForm({ ...form, remotePeerDeviceId: e.target.value, remoteFolder: '' })}
              >
                {remotePeerOptions.map((p) => (
                  <option key={p.deviceId} value={p.deviceId}>
                    {p.deviceName}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <span>リモートの共有フォルダ(クリックで移動、「このフォルダを使う」で確定)</span>
              <div className="sync-remote-picker">
                <div className="sync-remote-path">/{remoteBrowsePath}</div>
                {remoteBrowsePath && (
                  <button
                    className="button secondary small"
                    onClick={() => setRemoteBrowsePath(remoteBrowsePath.split('/').slice(0, -1).join('/'))}
                  >
                    ← 戻る
                  </button>
                )}
                <ul className="sync-remote-entry-list">
                  {remoteEntries
                    .filter((e) => e.isDirectory)
                    .map((entry) => (
                      <li key={entry.name}>
                        <button
                          className="button secondary small"
                          onClick={() => setRemoteBrowsePath(remoteBrowsePath ? `${remoteBrowsePath}/${entry.name}` : entry.name)}
                        >
                          📁 {entry.name}
                        </button>
                      </li>
                    ))}
                </ul>
                <button
                  className="button primary small"
                  disabled={!remoteBrowsePath}
                  onClick={() => setForm({ ...form, remoteFolder: remoteBrowsePath })}
                >
                  このフォルダを使う{form.remoteFolder ? `(現在: /${form.remoteFolder})` : ''}
                </button>
              </div>
            </div>
            <div className="field">
              <span>方向</span>
              <div className="sort-mode-switch">
                <button
                  className={form.direction === 'push' ? 'button secondary small active' : 'button secondary small'}
                  onClick={() => setForm({ ...form, direction: 'push' as SyncDirection })}
                >
                  push(ローカル→リモート)
                </button>
                <button
                  className={form.direction === 'pull' ? 'button secondary small active' : 'button secondary small'}
                  onClick={() => setForm({ ...form, direction: 'pull' as SyncDirection })}
                >
                  pull(リモート→ローカル)
                </button>
              </div>
            </div>
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={form.useVersioning}
                onChange={(e) => setForm({ ...form, useVersioning: e.target.checked })}
              />
              <span>削除/上書き時にごみ箱の代わりにバージョン退避フォルダ(.landrop-versions)へ移動する</span>
            </label>
            <div className="modal-actions">
              <button className="button secondary" onClick={() => setForm(null)}>
                キャンセル
              </button>
              <button className="button primary" onClick={() => void handleSave()}>
                保存
              </button>
            </div>
          </div>
        )}

        {activePairId && (
          <div className="sync-plan">
            <h3>比較結果</h3>
            {comparing && <p className="empty-hint">比較中…</p>}
            {plan && (
              <>
                <div className="sync-plan-summary">
                  <span>作成: {plan.summary.creates}</span>
                  <span>更新: {plan.summary.updates}</span>
                  <span className="sync-plan-delete-count">削除: {plan.summary.deletes}</span>
                  <span>一致: {plan.summary.skips}</span>
                </div>
                <ul className="sync-plan-items">
                  {plan.items
                    .filter((item) => item.action !== 'skip')
                    .map((item) => (
                      <li key={item.relPath} className={item.action === 'delete' ? 'sync-plan-item danger' : 'sync-plan-item'}>
                        <span className="sync-plan-item-action">{actionLabel(item.action)}</span>
                        <span className="sync-plan-item-path">{item.relPath}</span>
                        <span className="sync-plan-item-size">
                          {item.sourceSize !== undefined ? formatBytes(item.sourceSize) : ''}
                          {item.targetSize !== undefined ? ` (旧: ${formatBytes(item.targetSize)})` : ''}
                        </span>
                      </li>
                    ))}
                  {plan.items.every((item) => item.action === 'skip') && <li className="empty-hint">変更点はありません</li>}
                </ul>
                <div className="modal-actions">
                  <button className="button secondary" onClick={() => setActivePairId(null)}>
                    閉じる
                  </button>
                  <button className="button primary" onClick={() => void handleExecute(activePairId)} disabled={executing}>
                    {executing ? '同期中…' : '同期実行'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <ActivityList activities={activities} />

        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}

function actionLabel(action: string): string {
  if (action === 'create') return '作成'
  if (action === 'update') return '更新'
  if (action === 'delete') return '削除'
  return action
}
