import { useEffect, useRef, useState } from 'react'
import type { DuplicateScanProgress, DuplicateScanResult, DuplicateSimilarFolderPair } from '../../../shared/types'
import { formatBytes } from '../utils/format'

const PHASE_LABELS: Record<DuplicateScanProgress['phase'], string> = {
  walking: 'フォルダを走査中',
  hashing: '内容を照合中',
  comparing: 'グループ化中'
}

// グループごとに色を変えて、隣り合うグループの境目や「どれとどれが同じセットか」を見分けやすくする
const GROUP_ACCENT_COLORS = ['#5878e8', '#4fb0c6', '#c68a4f', '#8a5fd1', '#4fb37a', '#d1667d', '#c6b04f', '#4f7dd1']

function groupAccentColor(index: number): string {
  return GROUP_ACCENT_COLORS[index % GROUP_ACCENT_COLORS.length]
}

/** フルパスをファイル/フォルダ名と、その親フォルダパスに分ける(表示用) */
function splitPath(fullPath: string): { name: string; dir: string } {
  const idx = Math.max(fullPath.lastIndexOf('/'), fullPath.lastIndexOf('\\'))
  if (idx === -1) return { name: fullPath, dir: '' }
  return { name: fullPath.slice(idx + 1), dir: fullPath.slice(0, idx) }
}

export default function DuplicateFinderWindowApp(): JSX.Element {
  const [rootPaths, setRootPaths] = useState<string[]>([])
  const [scanId, setScanId] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<DuplicateScanProgress | null>(null)
  const [result, setResult] = useState<DuplicateScanResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [busyPaths, setBusyPaths] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'exact' | 'similar'>('exact')
  const scanIdRef = useRef<string | null>(null)

  useEffect(() => {
    document.title = 'LanDrop - 重複チェック'
    const unsubProgress = window.electronAPI.onDuplicateScanProgress((payload) => {
      if (payload.scanId !== scanIdRef.current) return
      setProgress(payload)
    })
    const unsubResult = window.electronAPI.onDuplicateScanResult((payload) => {
      if (payload.scanId !== scanIdRef.current) return
      setScanning(false)
      setResult(payload)
    })
    const unsubError = window.electronAPI.onDuplicateScanError((payload) => {
      if (payload.scanId !== scanIdRef.current) return
      setScanning(false)
      setErrorMessage(payload.message)
    })
    return () => {
      unsubProgress()
      unsubResult()
      unsubError()
    }
  }, [])

  async function handleChooseFolder(): Promise<void> {
    const chosen = await window.electronAPI.chooseDuplicateScanFolder()
    if (!chosen || chosen.length === 0) return
    setRootPaths((prev) => Array.from(new Set([...prev, ...chosen])))
  }

  function handleRemoveRootPath(path: string): void {
    setRootPaths((prev) => prev.filter((p) => p !== path))
  }

  async function handleStartScan(): Promise<void> {
    if (rootPaths.length === 0) return
    setErrorMessage(null)
    setResult(null)
    setProgress(null)
    setScanning(true)
    const id = await window.electronAPI.startDuplicateScan(rootPaths)
    scanIdRef.current = id
    setScanId(id)
  }

  async function handleCancel(): Promise<void> {
    if (!scanId) return
    await window.electronAPI.cancelDuplicateScan(scanId)
  }

  function handleOpen(path: string): void {
    void window.electronAPI.openFolder(path)
  }

  function handleReveal(path: string): void {
    void window.electronAPI.revealPathInExplorer(path)
  }

  async function handleTrash(path: string): Promise<void> {
    if (!window.confirm(`ごみ箱へ移動しますか？\n${path}`)) return
    setBusyPaths((prev) => new Set(prev).add(path))
    const res = await window.electronAPI.trashPath(path)
    setBusyPaths((prev) => {
      const next = new Set(prev)
      next.delete(path)
      return next
    })
    if (!res.ok) {
      window.alert(`ごみ箱へ移動できませんでした: ${res.error ?? ''}`)
      return
    }
    setResult((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        folderGroups: removePathFromGroups(prev.folderGroups, path),
        fileGroups: removePathFromGroups(prev.fileGroups, path),
        similarFolderPairs: prev.similarFolderPairs.filter((p) => p.pathA !== path && p.pathB !== path)
      }
    })
  }

  const hasResult = result && !result.cancelled
  const noDuplicatesFound = hasResult && result.folderGroups.length === 0 && result.fileGroups.length === 0
  // 削減できる容量が大きいものほど上に出す(件数が多い時に優先順位をつけやすくするため)
  const sortedFolderGroups = hasResult
    ? [...result.folderGroups].sort((a, b) => b.totalSize * (b.paths.length - 1) - a.totalSize * (a.paths.length - 1))
    : []
  const sortedFileGroups = hasResult
    ? [...result.fileGroups].sort((a, b) => b.size * (b.paths.length - 1) - a.size * (a.paths.length - 1))
    : []

  return (
    <div className="modal-overlay">
      <div className="modal duplicate-finder-dialog">
        <h2>重複チェック</h2>
        <p className="sync-hint">
          指定したフォルダ(SSD丸ごとでも可)を配下まで再帰的に走査し、内容が完全一致するファイル・フォルダを見つけます。
          複数のフォルダ・ドライブを追加すれば、それらをまたいで重複を探せます。
          削除は行わず、一覧から手動で「開く」「フォルダで表示」「ごみ箱へ移動」を選んで確認しながら整理できます。
        </p>

        <div className="field">
          <span>スキャン対象フォルダ(複数選択可)</span>
          {rootPaths.length > 0 && (
            <ul className="duplicate-root-list">
              {rootPaths.map((path) => (
                <li key={path} className="duplicate-root-item">
                  <span className="duplicate-root-path">{path}</span>
                  <button
                    className="button secondary small"
                    onClick={() => handleRemoveRootPath(path)}
                    disabled={scanning}
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button className="button secondary" onClick={() => void handleChooseFolder()} disabled={scanning}>
            フォルダを追加
          </button>
        </div>

        <div className="modal-actions duplicate-finder-scan-actions">
          {scanning && (
            <button className="button secondary" onClick={() => void handleCancel()}>
              キャンセル
            </button>
          )}
          <button className="button primary" onClick={() => void handleStartScan()} disabled={rootPaths.length === 0 || scanning}>
            {scanning ? 'スキャン中…' : 'スキャン開始'}
          </button>
        </div>

        {scanning && progress && (
          <div className="duplicate-scan-progress">
            <div className="duplicate-scan-progress-label">
              {PHASE_LABELS[progress.phase]}
              {progress.phase === 'walking' && `(${progress.filesWalked}件検出)`}
              {progress.phase === 'hashing' && `(${progress.filesHashed}/${progress.filesToHash}件)`}
            </div>
            {progress.phase === 'hashing' && progress.filesToHash > 0 && (
              <div className="duplicate-scan-progress-bar">
                <div
                  className="duplicate-scan-progress-bar-fill"
                  style={{ width: `${Math.round((progress.filesHashed / progress.filesToHash) * 100)}%` }}
                />
              </div>
            )}
            <div className="duplicate-scan-progress-path" title={progress.currentPath}>
              {progress.currentPath}
            </div>
          </div>
        )}

        {errorMessage && <p className="empty-hint">スキャンに失敗しました: {errorMessage}</p>}
        {result?.cancelled && <p className="empty-hint">キャンセルしました</p>}

        {hasResult && (
          <div className="duplicate-scan-result">
            <div className="sync-plan-summary">
              <span>重複フォルダ: {result.folderGroups.length}組</span>
              <span>重複ファイル: {result.fileGroups.length}組</span>
              {result.errorCount > 0 && <span>読み取れなかった項目: {result.errorCount}件</span>}
            </div>

            {noDuplicatesFound && <p className="empty-hint">重複は見つかりませんでした</p>}

            <div className="sort-mode-switch duplicate-tab-switch">
              <button
                className={activeTab === 'exact' ? 'button secondary small active' : 'button secondary small'}
                onClick={() => setActiveTab('exact')}
              >
                完全一致({result.folderGroups.length + result.fileGroups.length}組)
              </button>
              <button
                className={activeTab === 'similar' ? 'button secondary small active' : 'button secondary small'}
                onClick={() => setActiveTab('similar')}
              >
                似ているフォルダ({result.similarFolderPairs.length}組)
              </button>
            </div>

            {activeTab === 'exact' && (
              <>
                {sortedFolderGroups.length > 0 && (
                  <>
                    <h3>重複フォルダ</h3>
                    <ul className="duplicate-group-list">
                      {sortedFolderGroups.map((group, index) => (
                        <DuplicateGroupItem
                          key={group.id}
                          index={index}
                          paths={group.paths}
                          detail={`${group.fileCount}件のファイル・${formatBytes(group.totalSize)}`}
                          busyPaths={busyPaths}
                          onOpen={handleOpen}
                          onReveal={handleReveal}
                          onTrash={(p) => void handleTrash(p)}
                        />
                      ))}
                    </ul>
                  </>
                )}

                {sortedFileGroups.length > 0 && (
                  <>
                    <h3>重複ファイル</h3>
                    <ul className="duplicate-group-list">
                      {sortedFileGroups.map((group, index) => (
                        <DuplicateGroupItem
                          key={group.id}
                          index={index}
                          paths={group.paths}
                          detail={formatBytes(group.size)}
                          busyPaths={busyPaths}
                          onOpen={handleOpen}
                          onReveal={handleReveal}
                          onTrash={(p) => void handleTrash(p)}
                        />
                      ))}
                    </ul>
                  </>
                )}

                {sortedFolderGroups.length === 0 && sortedFileGroups.length === 0 && !noDuplicatesFound && (
                  <p className="empty-hint">完全一致する項目はありません</p>
                )}
              </>
            )}

            {activeTab === 'similar' && (
              <>
                <p className="sync-hint">
                  完全一致した重複フォルダの1つ上の階層同士を比較し、中身が50%以上一致するものを表示しています。
                  完全一致ではないため、削除前に必ず中身を見比べてください。
                </p>
                {result.similarFolderPairs.length === 0 ? (
                  <p className="empty-hint">似ているフォルダは見つかりませんでした</p>
                ) : (
                  <ul className="duplicate-group-list">
                    {result.similarFolderPairs.map((pair, index) => (
                      <SimilarFolderPairItem
                        key={pair.id}
                        index={index}
                        pair={pair}
                        busyPaths={busyPaths}
                        onOpen={handleOpen}
                        onReveal={handleReveal}
                        onTrash={(p) => void handleTrash(p)}
                      />
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button className="button secondary" onClick={() => window.close()}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}

function removePathFromGroups<T extends { paths: string[] }>(groups: T[], path: string): T[] {
  return groups
    .map((g) => ({ ...g, paths: g.paths.filter((p) => p !== path) }))
    .filter((g) => g.paths.length >= 2)
}

interface DuplicateGroupItemProps {
  index: number
  paths: string[]
  detail: string
  busyPaths: Set<string>
  onOpen: (path: string) => void
  onReveal: (path: string) => void
  onTrash: (path: string) => void
}

function DuplicateGroupItem({ index, paths, detail, busyPaths, onOpen, onReveal, onTrash }: DuplicateGroupItemProps): JSX.Element {
  const accent = groupAccentColor(index)
  return (
    <li className="duplicate-group-item" style={{ borderLeftColor: accent }}>
      <div className="duplicate-group-header">
        <span className="duplicate-group-index" style={{ background: accent }}>
          {index + 1}
        </span>
        <span className="duplicate-group-detail">{detail}</span>
      </div>
      <ul className="duplicate-group-paths">
        {paths.map((path) => {
          const { name, dir } = splitPath(path)
          return (
            <li key={path} className="duplicate-group-path-row">
              <div className="duplicate-group-path" title={path}>
                <div className="duplicate-group-path-name">{name}</div>
                <div className="duplicate-group-path-dir">{dir}</div>
              </div>
              <div className="duplicate-group-path-actions">
                <button className="button secondary small" onClick={() => onOpen(path)}>
                  開く
                </button>
                <button className="button secondary small" onClick={() => onReveal(path)}>
                  フォルダで表示
                </button>
                <button className="button secondary small" onClick={() => onOpen(dir)} disabled={!dir}>
                  1つ上を開く
                </button>
                <button className="button secondary small" onClick={() => onTrash(path)} disabled={busyPaths.has(path)}>
                  ごみ箱へ移動
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </li>
  )
}

interface SimilarFolderPairItemProps {
  index: number
  pair: DuplicateSimilarFolderPair
  busyPaths: Set<string>
  onOpen: (path: string) => void
  onReveal: (path: string) => void
  onTrash: (path: string) => void
}

function SimilarFolderPairItem({ index, pair, busyPaths, onOpen, onReveal, onTrash }: SimilarFolderPairItemProps): JSX.Element {
  const accent = groupAccentColor(index)
  const sides = [
    { path: pair.pathA, totalFiles: pair.totalFileCountA },
    { path: pair.pathB, totalFiles: pair.totalFileCountB }
  ]
  return (
    <li className="duplicate-group-item" style={{ borderLeftColor: accent }}>
      <div className="duplicate-group-header">
        <span className="duplicate-group-index" style={{ background: accent }}>
          {index + 1}
        </span>
        <span className="duplicate-group-detail">
          一致度 {pair.similarityPercent}%(共通 {pair.matchedFileCount}件)
        </span>
      </div>
      <ul className="duplicate-group-paths">
        {sides.map(({ path, totalFiles }) => {
          const { name, dir } = splitPath(path)
          return (
            <li key={path} className="duplicate-group-path-row">
              <div className="duplicate-group-path" title={path}>
                <div className="duplicate-group-path-name">
                  {name}
                  <span className="duplicate-group-path-filecount">(全{totalFiles}件)</span>
                </div>
                <div className="duplicate-group-path-dir">{dir}</div>
              </div>
              <div className="duplicate-group-path-actions">
                <button className="button secondary small" onClick={() => onOpen(path)}>
                  開く
                </button>
                <button className="button secondary small" onClick={() => onReveal(path)}>
                  フォルダで表示
                </button>
                <button className="button secondary small" onClick={() => onOpen(dir)} disabled={!dir}>
                  1つ上を開く
                </button>
                <button className="button secondary small" onClick={() => onTrash(path)} disabled={busyPaths.has(path)}>
                  ごみ箱へ移動
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </li>
  )
}
