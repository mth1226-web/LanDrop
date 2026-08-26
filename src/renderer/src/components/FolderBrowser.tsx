import { useEffect, useRef, useState } from 'react'
import type { BrowseEntry, EntryMetadata } from '../../../shared/types'
import { joinRelPath, pathSegments } from '../store'
import { formatBytes, hexToRgba } from '../utils/format'
import { getPreviewKind } from '../utils/previewKind'
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
  onNavigate,
  onUploadFiles,
  onCreateFolder,
  onRename,
  onDownload,
  onRevealLocal,
  onSaveMetadata,
  onSetDownloadFolderOverride,
  onRemoveDownloadFolderOverride,
  onPreviewEntry
}: Props): JSX.Element {
  const [isDragOver, setIsDragOver] = useState(false)
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false)
  const [renamingEntry, setRenamingEntry] = useState<BrowseEntry | null>(null)
  const [detailsEntry, setDetailsEntry] = useState<BrowseEntry | null>(null)
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())
  const [showHidden, setShowHidden] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const segments = pathSegments(currentPath)
  const isAtRoot = currentPath === ''

  useEffect(() => {
    setSelectedNames(new Set())
  }, [currentPath])

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
    window.electronAPI.startDrag(joinRelPath(currentPath, entry.name))
  }

  const hiddenCount = entries.filter((e) => metadata[e.name]?.hidden).length
  const visibleEntries = entries.filter((e) => showHidden || !metadata[e.name]?.hidden)
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
        if (!isAtRoot) setIsDragOver(true)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="folder-browser-header">
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
        <div className="folder-browser-actions">
          {hiddenCount > 0 && (
            <button className="button secondary small" onClick={() => setShowHidden((v) => !v)}>
              {showHidden ? '非表示項目を隠す' : `非表示項目を表示（${hiddenCount}）`}
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
                className={meta?.hidden ? 'entry-item entry-hidden' : 'entry-item'}
                style={meta?.color ? { borderLeft: `3px solid ${meta.color}` } : undefined}
                draggable={isSelf}
                onDragStart={isSelf ? (e) => handleDragStartToOs(e, entry) : undefined}
              >
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
                  onClick={() => {
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
