import { useEffect, useRef, useState } from 'react'
import type { BrowseEntry, EntryMetadata, SortMode } from '../../../shared/types'
import { joinRelPath, parentRelPath, pathSegments } from '../store'
import { formatBytes, hexToRgba } from '../utils/format'
import { getPreviewKind } from '../utils/previewKind'
import { markInternalDragStart, markInternalDragEnd, isInternalDragActive } from '../utils/internalDrag'
import { sortEntries } from '../utils/sortEntries'
import InputDialog from './InputDialog'
import EntryDetailsDialog from './EntryDetailsDialog'

interface Props {
  peerName: string
  currentPath: string
  entries: BrowseEntry[]
  metadata: Record<string, EntryMetadata>
  downloadFolderOverrides: Record<string, string>
  isLoading: boolean
  isSelf: boolean
  accentColor?: string
  sortMode: SortMode
  customOrder: string[]
  onNavigate: (path: string) => void
  onUploadFiles: (filePaths: string[]) => void
  onCreateFolder: (name: string) => void
  onRename: (oldName: string, newName: string) => void
  onDownload: (entries: BrowseEntry[]) => void
  onRevealLocal: (entry: BrowseEntry) => void
  onSaveMetadata: (entryName: string, patch: Partial<EntryMetadata>) => void
  onSetDownloadFolderOverride: (label: string) => void
  onRemoveDownloadFolderOverride: (label: string) => void
  onPreviewEntry: (entry: BrowseEntry) => void
  onChangeSortMode: (mode: SortMode) => void
  onMoveEntry: (name: string, direction: 'up' | 'down') => void
  onReorderEntries: (draggedName: string, targetName: string, after: boolean) => void
}

export default function FolderBrowser({
  peerName,
  currentPath,
  entries,
  metadata,
  downloadFolderOverrides,
  isLoading,
  isSelf,
  accentColor,
  sortMode,
  customOrder,
  onNavigate,
  onUploadFiles,
  onCreateFolder,
  onRename,
  onDownload,
  onRevealLocal,
  onSaveMetadata,
  onSetDownloadFolderOverride,
  onRemoveDownloadFolderOverride,
  onPreviewEntry,
  onChangeSortMode,
  onMoveEntry,
  onReorderEntries
}: Props): JSX.Element {
  const [isDragOver, setIsDragOver] = useState(false)
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false)
  const [renamingEntry, setRenamingEntry] = useState<BrowseEntry | null>(null)
  const [detailsEntry, setDetailsEntry] = useState<BrowseEntry | null>(null)
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())
  const [showHidden, setShowHidden] = useState(false)
  const [showMemoInline, setShowMemoInline] = useState(true)
  const [draggedName, setDraggedName] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ name: string; after: boolean } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const segments = pathSegments(currentPath)
  const isAtRoot = currentPath === ''

  useEffect(() => {
    setSelectedNames(new Set())
  }, [currentPath])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Backspace' || isAtRoot) return
      const active = document.activeElement
      const isEditing =
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
      if (isEditing) return
      e.preventDefault()
      onNavigate(parentRelPath(currentPath))
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [currentPath, isAtRoot, onNavigate])

  function toggleSelected(name: string): void {
    setSelectedNames((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setIsDragOver(false)
    // 自分の項目をOSへドラッグ中に同じウィンドウ内へ落とした場合は、複製されてしまうため無視する
    if (isInternalDragActive()) return
    if (isAtRoot) return
    const paths = Array.from(e.dataTransfer.files).map((file) => window.electronAPI.getPathForFile(file))
    if (paths.length > 0) onUploadFiles(paths)
  }

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>): void {
    const files = e.target.files
    if (!files || files.length === 0) return
    const paths = Array.from(files).map((file) => window.electronAPI.getPathForFile(file))
    onUploadFiles(paths)
    e.target.value = ''
  }

  function handleDragStartToOs(e: React.DragEvent<HTMLLIElement>, entry: BrowseEntry): void {
    e.preventDefault()
    markInternalDragStart()
    window.electronAPI.startDrag(joinRelPath(currentPath, entry.name))
  }

  function handleEntryDragStart(e: React.DragEvent<HTMLLIElement>, entry: BrowseEntry): void {
    if (sortMode === 'manual') {
      e.dataTransfer.effectAllowed = 'move'
      markInternalDragStart()
      setDraggedName(entry.name)
      return
    }
    if (isSelf) handleDragStartToOs(e, entry)
  }

  function handleReorderDragOver(e: React.DragEvent<HTMLLIElement>, entry: BrowseEntry): void {
    if (sortMode !== 'manual' || !draggedName || draggedName === entry.name) return
    e.preventDefault()
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const after = e.clientY - rect.top > rect.height / 2
    setDropTarget({ name: entry.name, after })
  }

  function handleReorderDrop(e: React.DragEvent<HTMLLIElement>, entry: BrowseEntry): void {
    if (sortMode !== 'manual' || !draggedName) return
    e.preventDefault()
    e.stopPropagation()
    if (draggedName !== entry.name) {
      const after = dropTarget?.name === entry.name ? dropTarget.after : false
      onReorderEntries(draggedName, entry.name, after)
    }
    setDraggedName(null)
    setDropTarget(null)
  }

  function handleEntryDragEnd(): void {
    markInternalDragEnd()
    setDraggedName(null)
    setDropTarget(null)
  }

  const hiddenCount = entries.filter((e) => metadata[e.name]?.hidden).length
  const memoCount = entries.filter((e) => metadata[e.name]?.memo).length
  const sortedEntries = sortEntries(entries, sortMode, customOrder)
  const visibleEntries = sortedEntries.filter((e) => showHidden || !metadata[e.name]?.hidden)
  const selectedEntries = visibleEntries.filter((e) => selectedNames.has(e.name))

  const selfStyle: React.CSSProperties =
    isSelf && accentColor
      ? { borderColor: accentColor, borderStyle: 'solid', backgroundColor: hexToRgba(accentColor, 0.06) }
      : {}

  return (
    <div
      className={isDragOver ? 'panel folder-browser drag-over' : 'panel folder-browser'}
      style={selfStyle}
      onDragOver={(e) => {
        e.preventDefault()
        if (!isAtRoot && !isInternalDragActive()) setIsDragOver(true)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="folder-browser-header">
        <div className="breadcrumb-row">
          <button
            className="button secondary small breadcrumb-back"
            title="ひとつ上の階層へ戻る（Backspaceキーでも戻れます）"
            disabled={isAtRoot}
            onClick={() => onNavigate(parentRelPath(currentPath))}
          >
            ← 戻る
          </button>
          <nav className="breadcrumb">
            <button className="breadcrumb-item" onClick={() => onNavigate('')}>
              {peerName}
            </button>
            {segments.map((seg, i) => (
              <span key={i}>
                <span className="breadcrumb-sep">/</span>
                <button className="breadcrumb-item" onClick={() => onNavigate(segments.slice(0, i + 1).join('/'))}>
                  {seg}
                </button>
              </span>
            ))}
          </nav>
        </div>
        <div className="folder-browser-actions">
          <div className="sort-mode-switch">
            <button
              className={sortMode === 'name' ? 'button secondary small active' : 'button secondary small'}
              onClick={() => onChangeSortMode('name')}
            >
              名前順
            </button>
            <button
              className={sortMode === 'date' ? 'button secondary small active' : 'button secondary small'}
              onClick={() => onChangeSortMode('date')}
            >
              日付順
            </button>
            <button
              className={sortMode === 'manual' ? 'button secondary small active' : 'button secondary small'}
              onClick={() => onChangeSortMode('manual')}
            >
              マニュアル
            </button>
          </div>
          {hiddenCount > 0 && (
            <button className="button secondary small" onClick={() => setShowHidden((v) => !v)}>
              {showHidden ? '非表示項目を隠す' : `非表示項目を表示（${hiddenCount}）`}
            </button>
          )}
          {memoCount > 0 && (
            <button
              className={showMemoInline ? 'button secondary small active' : 'button secondary small'}
              onClick={() => setShowMemoInline((v) => !v)}
            >
              {showMemoInline ? 'メモを行から隠す' : 'メモを行に表示'}
            </button>
          )}
          {!isSelf && selectedEntries.length > 0 && (
            <button className="button primary" onClick={() => onDownload(selectedEntries)}>
              選択した{selectedEntries.length}件をダウンロード
            </button>
          )}
          {!isAtRoot && (
            <>
              <button className="button secondary" onClick={() => setShowNewFolderDialog(true)}>
                新しいフォルダ
              </button>
              <button className="button primary" onClick={() => fileInputRef.current?.click()}>
                アップロード
              </button>
              <input ref={fileInputRef} type="file" multiple hidden onChange={handleFilePicked} />
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="empty-hint">読み込み中…</p>
      ) : visibleEntries.length === 0 ? (
        <p className="empty-hint">
          {isAtRoot
            ? '共有フォルダがありません（設定画面から追加できます）'
            : 'このフォルダは空です。ファイルをドラッグ&ドロップしてアップロードできます'}
        </p>
      ) : (
        <ul className="entry-list">
          {visibleEntries.map((entry) => {
            const meta = metadata[entry.name]
            const override = downloadFolderOverrides[entry.name]
            return (
              <li
                key={entry.name}
                className={[
                  'entry-item',
                  meta?.hidden ? 'entry-hidden' : '',
                  dropTarget?.name === entry.name ? (dropTarget.after ? 'entry-drop-after' : 'entry-drop-before') : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={
                  meta?.color
                    ? { backgroundColor: hexToRgba(meta.color, 0.18), borderLeft: `3px solid ${meta.color}` }
                    : undefined
                }
                draggable={sortMode === 'manual' || isSelf}
                onDragStart={(e) => handleEntryDragStart(e, entry)}
                onDragOver={(e) => handleReorderDragOver(e, entry)}
                onDrop={(e) => handleReorderDrop(e, entry)}
                onDragEnd={handleEntryDragEnd}
              >
                <div className="entry-row">
                  {!isSelf && (
                    <input
                      type="checkbox"
                      className="entry-checkbox"
                      checked={selectedNames.has(entry.name)}
                      onChange={() => toggleSelected(entry.name)}
                    />
                  )}
                  <button
                    className="entry-main"
                    title="ダブルクリックで開く"
                    onDoubleClick={() => {
                      if (entry.isDirectory) onNavigate(joinRelPath(currentPath, entry.name))
                      else if (getPreviewKind(entry.name)) onPreviewEntry(entry)
                    }}
                    disabled={!entry.isDirectory && !getPreviewKind(entry.name)}
                  >
                    <span className="entry-icon">
                      {entry.isDirectory ? '📁' : getPreviewKind(entry.name) === 'image' ? '🖼️' : getPreviewKind(entry.name) === 'video' ? '🎬' : '📄'}
                    </span>
                    <span className={meta?.imported ? 'entry-name entry-imported' : 'entry-name'}>{entry.name}</span>
                    {meta?.imported && (
                      <span className="entry-badge" title="取り込み済み">
                        ✓
                      </span>
                    )}
                    {meta?.memo && (
                      <span className="entry-badge" title={meta.memo}>
                        📝
                      </span>
                    )}
                    {!entry.isDirectory && <span className="entry-size">{formatBytes(entry.size)}</span>}
                  </button>
                  <div className="entry-actions">
                    {sortMode === 'manual' && (
                      <span className="entry-reorder">
                        <button
                          className="button secondary small"
                          title="上へ移動"
                          onClick={() => onMoveEntry(entry.name, 'up')}
                        >
                          ↑
                        </button>
                        <button
                          className="button secondary small"
                          title="下へ移動"
                          onClick={() => onMoveEntry(entry.name, 'down')}
                        >
                          ↓
                        </button>
                      </span>
                    )}
                    {!isSelf && (
                      <button className="button secondary small" onClick={() => onDownload([entry])}>
                        ダウンロード
                      </button>
                    )}
                    {!entry.isDirectory && isSelf && (
                      <button className="button secondary small" onClick={() => onRevealLocal(entry)}>
                        フォルダで表示
                      </button>
                    )}
                    {isAtRoot &&
                      (override ? (
                        <button
                          className="button secondary small"
                          title={override}
                          onClick={() => onRemoveDownloadFolderOverride(entry.name)}
                        >
                          保存先を解除
                        </button>
                      ) : (
                        <button className="button secondary small" onClick={() => onSetDownloadFolderOverride(entry.name)}>
                          保存先を設定
                        </button>
                      ))}
                    <button className="button secondary small" onClick={() => setDetailsEntry(entry)}>
                      詳細
                    </button>
                    {!isAtRoot && (
                      <button className="button secondary small" onClick={() => setRenamingEntry(entry)}>
                        名前変更
                      </button>
                    )}
                  </div>
                </div>
                {showMemoInline && meta?.memo && <p className="entry-memo-line">{meta.memo}</p>}
              </li>
            )
          })}
        </ul>
      )}

      {showNewFolderDialog && (
        <InputDialog
          title="新しいフォルダ"
          label="フォルダ名"
          confirmLabel="作成"
          onConfirm={(name) => {
            onCreateFolder(name)
            setShowNewFolderDialog(false)
          }}
          onCancel={() => setShowNewFolderDialog(false)}
        />
      )}

      {renamingEntry && (
        <InputDialog
          title="名前を変更"
          label="新しい名前"
          initialValue={renamingEntry.name}
          confirmLabel="変更"
          onConfirm={(newName) => {
            onRename(renamingEntry.name, newName)
            setRenamingEntry(null)
          }}
          onCancel={() => setRenamingEntry(null)}
        />
      )}

      {detailsEntry && (
        <EntryDetailsDialog
          entryName={detailsEntry.name}
          metadata={metadata[detailsEntry.name] ?? { hidden: false, color: null, memo: '', imported: false }}
          onSave={(patch) => onSaveMetadata(detailsEntry.name, patch)}
          onClose={() => setDetailsEntry(null)}
        />
      )}
    </div>
  )
}
