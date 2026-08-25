import { useEffect, useRef, useState } from 'react'
import type { BrowseEntry } from '../../../shared/types'
import { joinRelPath, pathSegments } from '../store'
import { formatBytes } from '../utils/format'
import InputDialog from './InputDialog'

interface Props {
  peerName: string
  currentPath: string
  entries: BrowseEntry[]
  isLoading: boolean
  isSelf: boolean
  onNavigate: (path: string) => void
  onUploadFiles: (filePaths: string[]) => void
  onCreateFolder: (name: string) => void
  onRename: (oldName: string, newName: string) => void
  onDownload: (entries: BrowseEntry[]) => void
  onRevealLocal: (entry: BrowseEntry) => void
}

export default function FolderBrowser({
  peerName,
  currentPath,
  entries,
  isLoading,
  isSelf,
  onNavigate,
  onUploadFiles,
  onCreateFolder,
  onRename,
  onDownload,
  onRevealLocal
}: Props): JSX.Element {
  const [isDragOver, setIsDragOver] = useState(false)
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false)
  const [renamingEntry, setRenamingEntry] = useState<BrowseEntry | null>(null)
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())
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

  const selectedEntries = entries.filter((e) => selectedNames.has(e.name))

  return (
    <div
      className={isDragOver ? 'panel folder-browser drag-over' : 'panel folder-browser'}
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
      ) : entries.length === 0 ? (
        <p className="empty-hint">
          {isAtRoot
            ? '共有フォルダがありません（設定画面から追加できます）'
            : 'このフォルダは空です。ファイルをドラッグ&ドロップしてアップロードできます'}
        </p>
      ) : (
        <ul className="entry-list">
          {entries.map((entry) => (
            <li key={entry.name} className="entry-item">
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
                onClick={() => entry.isDirectory && onNavigate(joinRelPath(currentPath, entry.name))}
                disabled={!entry.isDirectory}
              >
                <span className="entry-icon">{entry.isDirectory ? '📁' : '📄'}</span>
                <span className="entry-name">{entry.name}</span>
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
                {!isAtRoot && (
                  <button className="button secondary small" onClick={() => setRenamingEntry(entry)}>
                    名前変更
                  </button>
                )}
              </div>
            </li>
          ))}
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
    </div>
  )
}
