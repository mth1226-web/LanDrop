import { useEffect, useRef, useState } from 'react'
import type { BrowseEntry, EntryMetadata, PasteMode, SortMode, ViewMode } from '../../../shared/types'
import { joinRelPath, parentRelPath, pathSegments } from '../store'
import { formatBytes, formatDate, hexToRgba } from '../utils/format'
import { getPreviewKind } from '../utils/previewKind'
import { markInternalDragStart, markInternalDragEnd, isInternalDragActive } from '../utils/internalDrag'
import { sortEntries } from '../utils/sortEntries'
import InputDialog from './InputDialog'
import EntryDetailsDialog from './EntryDetailsDialog'

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  extraLargeIcons: '特大アイコン',
  largeIcons: '大アイコン',
  mediumIcons: '中アイコン',
  smallIcons: '小アイコン',
  list: '一覧',
  details: '詳細',
  tiles: '並べて表示',
  content: 'コンテンツ',
  columns: 'カラム表示'
}

const VIEW_MODE_ORDER: ViewMode[] = [
  'extraLargeIcons',
  'largeIcons',
  'mediumIcons',
  'smallIcons',
  'list',
  'details',
  'tiles',
  'content',
  'columns'
]

const GRID_ICON_SIZE: Partial<Record<ViewMode, number>> = {
  extraLargeIcons: 180,
  largeIcons: 96,
  mediumIcons: 56,
  tiles: 48
}

const GRID_MIN_COLUMN: Partial<Record<ViewMode, number>> = {
  extraLargeIcons: 200,
  largeIcons: 130,
  mediumIcons: 90,
  tiles: 220
}

interface ColumnData {
  path: string
  entries: BrowseEntry[]
  metadata: Record<string, EntryMetadata>
}

function viewFamily(mode: ViewMode): 'grid' | 'flow' | 'row' | 'columns' {
  if (mode === 'extraLargeIcons' || mode === 'largeIcons' || mode === 'mediumIcons' || mode === 'tiles') return 'grid'
  if (mode === 'smallIcons' || mode === 'list') return 'flow'
  if (mode === 'columns') return 'columns'
  return 'row'
}

interface Props {
  peerName: string
  peerDeviceId: string
  currentPath: string
  entries: BrowseEntry[]
  metadata: Record<string, EntryMetadata>
  downloadFolderOverrides: Record<string, string>
  isLoading: boolean
  isSelf: boolean
  previewBaseUrl: string | null
  accentColor?: string
  sortMode: SortMode
  viewMode: ViewMode
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
  onChangeViewMode: (mode: ViewMode) => void
  onMoveEntry: (name: string, direction: 'up' | 'down') => void
  onReorderEntries: (draggedName: string, targetName: string, after: boolean) => void
  clipboard: { peerDeviceId: string; mode: PasteMode; count: number } | null
  onCopyEntries: (entries: BrowseEntry[]) => void
  onCutEntries: (entries: BrowseEntry[]) => void
  onPasteEntries: () => void
  onTrashEntries: (names: string[]) => void
}

export default function FolderBrowser({
  peerName,
  peerDeviceId,
  currentPath,
  entries,
  metadata,
  downloadFolderOverrides,
  isLoading,
  isSelf,
  previewBaseUrl,
  accentColor,
  sortMode,
  viewMode,
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
  onChangeViewMode,
  onMoveEntry,
  onReorderEntries,
  clipboard,
  onCopyEntries,
  onCutEntries,
  onPasteEntries,
  onTrashEntries
}: Props): JSX.Element {
  const [isDragOver, setIsDragOver] = useState(false)
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false)
  const [renamingEntry, setRenamingEntry] = useState<BrowseEntry | null>(null)
  const [detailsEntry, setDetailsEntry] = useState<BrowseEntry | null>(null)
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())
  const [showHidden, setShowHidden] = useState(false)
  const [showMemoInline, setShowMemoInline] = useState(true)
  const [showThumbnails, setShowThumbnails] = useState(true)
  const [draggedName, setDraggedName] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ name: string; after: boolean } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [ancestorColumns, setAncestorColumns] = useState<ColumnData[]>([])
  const [columnsLoading, setColumnsLoading] = useState(false)
  const [columnFileSelection, setColumnFileSelection] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const segments = pathSegments(currentPath)
  const isAtRoot = currentPath === ''

  // カラム表示: 現在のフォルダ(currentPath)の中身はprops(entries/metadata)にそのまま使えるが、
  // 祖先の各階層は自前で取得してカラムとして並べる必要がある(親コンポーネントは現在地の分しか持っていないため)
  useEffect(() => {
    if (viewMode !== 'columns') return
    setColumnFileSelection(null)
    const segs = pathSegments(currentPath)
    const prefixes = segs.map((_, i) => segs.slice(0, i).join('/'))
    if (prefixes.length === 0) {
      setAncestorColumns([])
      return
    }
    let cancelled = false
    setColumnsLoading(true)
    Promise.all(
      prefixes.map(async (p) => {
        const list = await window.electronAPI.browseFolder(peerDeviceId, p)
        const meta = await window.electronAPI.getEntryMetadataForChildren(peerDeviceId, p, list.map((e) => e.name))
        return { path: p, entries: list, metadata: meta }
      })
    )
      .then((results) => {
        if (!cancelled) setAncestorColumns(results)
      })
      .finally(() => {
        if (!cancelled) setColumnsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [viewMode, currentPath, peerDeviceId])

  useEffect(() => {
    setSelectedNames(new Set())
    setSearchQuery('')
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

  async function handleEntryContextMenu(e: React.MouseEvent, entry: BrowseEntry): Promise<void> {
    e.preventDefault()
    // 右クリックした項目が選択中の複数選択に含まれていれば選択全体を、そうでなければその1件だけを対象にする
    const opEntries =
      selectedNames.size > 0 && selectedNames.has(entry.name)
        ? visibleEntries.filter((v) => selectedNames.has(v.name))
        : [entry]
    const override = downloadFolderOverrides[entry.name]
    const canPasteHere = !isAtRoot && clipboard?.peerDeviceId === peerDeviceId
    const items: { id: string; label: string; disabled?: boolean }[] = []
    if (sortMode === 'manual') {
      items.push({ id: 'moveUp', label: '上へ移動' }, { id: 'moveDown', label: '下へ移動' }, { id: '__separator__', label: '' })
    }
    if (!isSelf) items.push({ id: 'download', label: 'ダウンロード' })
    if (!entry.isDirectory && isSelf) items.push({ id: 'reveal', label: 'フォルダで表示' })
    if (isAtRoot) {
      items.push(
        override ? { id: 'removeOverride', label: '保存先を解除' } : { id: 'setOverride', label: '保存先を設定' }
      )
    }
    items.push(
      { id: '__separator__', label: '' },
      { id: 'copy', label: opEntries.length > 1 ? `コピー（${opEntries.length}件）` : 'コピー' },
      { id: 'cut', label: opEntries.length > 1 ? `切り取り（${opEntries.length}件）` : '切り取り' },
      { id: 'paste', label: '貼り付け', disabled: !canPasteHere },
      { id: '__separator__', label: '' },
      { id: 'delete', label: opEntries.length > 1 ? `ごみ箱に移動（${opEntries.length}件）` : 'ごみ箱に移動' },
      { id: 'details', label: '詳細' }
    )
    if (!isAtRoot) items.push({ id: 'rename', label: '名前変更' })

    const actionId = await window.electronAPI.showEntryContextMenu(items)
    switch (actionId) {
      case 'moveUp':
        onMoveEntry(entry.name, 'up')
        break
      case 'moveDown':
        onMoveEntry(entry.name, 'down')
        break
      case 'download':
        onDownload([entry])
        break
      case 'reveal':
        onRevealLocal(entry)
        break
      case 'setOverride':
        onSetDownloadFolderOverride(entry.name)
        break
      case 'removeOverride':
        onRemoveDownloadFolderOverride(entry.name)
        break
      case 'copy':
        onCopyEntries(opEntries)
        break
      case 'cut':
        onCutEntries(opEntries)
        break
      case 'paste':
        onPasteEntries()
        break
      case 'delete':
        onTrashEntries(opEntries.map((v) => v.name))
        break
      case 'details':
        setDetailsEntry(entry)
        break
      case 'rename':
        setRenamingEntry(entry)
        break
    }
  }

  const hiddenCount = entries.filter((e) => metadata[e.name]?.hidden).length
  const memoCount = entries.filter((e) => metadata[e.name]?.memo).length
  const sortedEntries = sortEntries(entries, sortMode, customOrder)
  const searchLower = searchQuery.trim().toLowerCase()
  const visibleEntries = sortedEntries.filter(
    (e) => (showHidden || !metadata[e.name]?.hidden) && (!searchLower || e.name.toLowerCase().includes(searchLower))
  )
  const selectedEntries = visibleEntries.filter((e) => selectedNames.has(e.name))

  const family = viewFamily(viewMode)
  const enrichedEntries = visibleEntries.map((entry) => {
    const meta = metadata[entry.name]
    const kind = entry.isDirectory ? null : getPreviewKind(entry.name)
    const thumbUrl =
      showThumbnails && !entry.isDirectory && previewBaseUrl && kind === 'image'
        ? `${previewBaseUrl}/api/download?path=${encodeURIComponent(joinRelPath(currentPath, entry.name))}&inline=1`
        : null
    const icon = entry.isDirectory ? '📁' : kind === 'image' ? '🖼️' : kind === 'video' ? '🎬' : '📄'
    return { entry, meta, kind, thumbUrl, icon, override: downloadFolderOverrides[entry.name] }
  })

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const active = document.activeElement
      const isEditing =
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
      if (isEditing) return
      const modifier = e.ctrlKey || e.metaKey

      if (e.key === 'Backspace' && !isAtRoot) {
        e.preventDefault()
        onNavigate(parentRelPath(currentPath))
        return
      }

      if (modifier && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault()
        setSelectedNames(new Set(visibleEntries.map((v) => v.name)))
        return
      }

      const selected = visibleEntries.filter((v) => selectedNames.has(v.name))

      if (modifier && (e.key === 'c' || e.key === 'C') && selected.length > 0) {
        e.preventDefault()
        onCopyEntries(selected)
        return
      }

      if (modifier && (e.key === 'x' || e.key === 'X') && selected.length > 0) {
        e.preventDefault()
        onCutEntries(selected)
        return
      }

      if (modifier && (e.key === 'v' || e.key === 'V') && clipboard && !isAtRoot) {
        e.preventDefault()
        onPasteEntries()
        return
      }

      if (e.key === 'Delete' && selected.length > 0) {
        e.preventDefault()
        onTrashEntries(selected.map((v) => v.name))
        return
      }

      if (e.key === 'F2' && selected.length === 1 && !isAtRoot) {
        e.preventDefault()
        setRenamingEntry(selected[0])
        return
      }

      if (e.key === 'Enter' && selected.length === 1) {
        e.preventDefault()
        const only = selected[0]
        if (only.isDirectory) onNavigate(joinRelPath(currentPath, only.name))
        else if (getPreviewKind(only.name)) onPreviewEntry(only)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    currentPath,
    isAtRoot,
    onNavigate,
    visibleEntries,
    selectedNames,
    clipboard,
    onCopyEntries,
    onCutEntries,
    onPasteEntries,
    onTrashEntries,
    onPreviewEntry
  ])

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
          <div className="search-box">
            <input
              type="search"
              placeholder="このフォルダ内を検索"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="search-box-clear" title="検索をクリア" onClick={() => setSearchQuery('')}>
                ×
              </button>
            )}
          </div>
        </div>
        <div className="folder-browser-actions">
          <label className="view-mode-select">
            <span>表示:</span>
            <select value={viewMode} onChange={(e) => onChangeViewMode(e.target.value as ViewMode)}>
              {VIEW_MODE_ORDER.map((mode) => (
                <option key={mode} value={mode}>
                  {VIEW_MODE_LABELS[mode]}
                </option>
              ))}
            </select>
          </label>
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
          <button
            className={showThumbnails ? 'button secondary small active' : 'button secondary small'}
            onClick={() => setShowThumbnails((v) => !v)}
          >
            {showThumbnails ? 'プレビューを隠す' : 'プレビューを表示'}
          </button>
          {!isSelf && selectedEntries.length > 0 && (
            <button className="button primary" onClick={() => onDownload(selectedEntries)}>
              選択した{selectedEntries.length}件をダウンロード
            </button>
          )}
          {selectedEntries.length > 0 && (
            <>
              <button className="button secondary" onClick={() => onCopyEntries(selectedEntries)}>
                コピー（{selectedEntries.length}）
              </button>
              <button className="button secondary" onClick={() => onCutEntries(selectedEntries)}>
                切り取り（{selectedEntries.length}）
              </button>
              <button
                className="button secondary"
                onClick={() => onTrashEntries(selectedEntries.map((v) => v.name))}
              >
                ごみ箱へ（{selectedEntries.length}）
              </button>
            </>
          )}
          {clipboard && !isAtRoot && (
            <button
              className="button secondary"
              title={clipboard.peerDeviceId !== peerDeviceId ? '貼り付け元と同じ端末の共有フォルダにのみ貼り付けられます' : undefined}
              disabled={clipboard.peerDeviceId !== peerDeviceId}
              onClick={onPasteEntries}
            >
              貼り付け（{clipboard.count}）{clipboard.mode === 'move' ? '・移動' : ''}
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
          {searchLower
            ? `「${searchQuery}」に一致する項目がありません`
            : isAtRoot
              ? '共有フォルダがありません（設定画面から追加できます）'
              : 'このフォルダは空です。ファイルをドラッグ&ドロップしてアップロードできます'}
        </p>
      ) : family === 'grid' ? (
        <ul className="entry-grid" style={{ ['--grid-min' as string]: `${GRID_MIN_COLUMN[viewMode]}px` }}>
          {enrichedEntries.map(({ entry, meta, kind, thumbUrl, icon }) => (
            <li
              key={entry.name}
              className={[
                'entry-card',
                viewMode === 'tiles' ? 'entry-card-tile' : 'entry-card-stack',
                meta?.hidden ? 'entry-hidden' : '',
                dropTarget?.name === entry.name ? (dropTarget.after ? 'entry-drop-after' : 'entry-drop-before') : ''
              ]
                .filter(Boolean)
                .join(' ')}
              style={meta?.color ? { backgroundColor: hexToRgba(meta.color, 0.18) } : undefined}
              draggable={sortMode === 'manual' || isSelf}
              onDragStart={(e) => handleEntryDragStart(e, entry)}
              onDragOver={(e) => handleReorderDragOver(e, entry)}
              onDrop={(e) => handleReorderDrop(e, entry)}
              onDragEnd={handleEntryDragEnd}
              onContextMenu={(e) => void handleEntryContextMenu(e, entry)}
            >
              <input
                type="checkbox"
                className="entry-card-checkbox"
                checked={selectedNames.has(entry.name)}
                onChange={() => toggleSelected(entry.name)}
              />
              <button
                className="entry-card-main"
                title="ダブルクリックで開く"
                onDoubleClick={() => {
                  if (entry.isDirectory) onNavigate(joinRelPath(currentPath, entry.name))
                  else if (kind) onPreviewEntry(entry)
                }}
                disabled={!entry.isDirectory && !kind}
              >
                <div className="entry-card-icon" style={{ ['--icon-size' as string]: `${GRID_ICON_SIZE[viewMode]}px` }}>
                  {thumbUrl ? (
                    <img src={thumbUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="entry-card-emoji">{icon}</span>
                  )}
                </div>
                <div className="entry-card-text">
                  <span className={meta?.imported ? 'entry-card-name entry-imported' : 'entry-card-name'}>
                    {entry.name}
                  </span>
                  {viewMode === 'tiles' && !entry.isDirectory && (
                    <span className="entry-card-meta">{formatBytes(entry.size)}</span>
                  )}
                  {meta?.memo && showMemoInline && <span className="entry-card-meta">{meta.memo}</span>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : family === 'flow' ? (
        <ul className="entry-flow-list">
          {enrichedEntries.map(({ entry, meta, kind, thumbUrl, icon }) => (
            <li
              key={entry.name}
              className={[
                'entry-flow-item',
                meta?.hidden ? 'entry-hidden' : '',
                dropTarget?.name === entry.name ? (dropTarget.after ? 'entry-drop-after' : 'entry-drop-before') : ''
              ]
                .filter(Boolean)
                .join(' ')}
              style={meta?.color ? { backgroundColor: hexToRgba(meta.color, 0.18), borderLeft: `3px solid ${meta.color}` } : undefined}
              draggable={sortMode === 'manual' || isSelf}
              onDragStart={(e) => handleEntryDragStart(e, entry)}
              onDragOver={(e) => handleReorderDragOver(e, entry)}
              onDrop={(e) => handleReorderDrop(e, entry)}
              onDragEnd={handleEntryDragEnd}
              onContextMenu={(e) => void handleEntryContextMenu(e, entry)}
            >
              <input
                type="checkbox"
                className="entry-checkbox"
                checked={selectedNames.has(entry.name)}
                onChange={() => toggleSelected(entry.name)}
              />
              <button
                className="entry-flow-main"
                title="ダブルクリックで開く"
                onDoubleClick={() => {
                  if (entry.isDirectory) onNavigate(joinRelPath(currentPath, entry.name))
                  else if (kind) onPreviewEntry(entry)
                }}
                disabled={!entry.isDirectory && !kind}
              >
                <span className="entry-flow-icon">
                  {thumbUrl ? <img src={thumbUrl} alt="" loading="lazy" /> : icon}
                </span>
                <span className={meta?.imported ? 'entry-flow-name entry-imported' : 'entry-flow-name'}>
                  {entry.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : family === 'columns' ? (
        <div className="column-browser">
          {ancestorColumns.map((col, i) => {
            const selectedName = segments[i]
            return (
              <div className="column-browser-col" key={col.path || '(root)'}>
                <ul className="column-browser-list">
                  {sortEntries(col.entries, sortMode, []).map((entry) => {
                    const meta = col.metadata[entry.name]
                    const entryKind = entry.isDirectory ? null : getPreviewKind(entry.name)
                    const entryIcon = entry.isDirectory ? '📁' : entryKind === 'image' ? '🖼️' : entryKind === 'video' ? '🎬' : '📄'
                    return (
                      <li key={entry.name}>
                        <button
                          className={
                            entry.name === selectedName ? 'column-browser-item selected' : 'column-browser-item'
                          }
                          style={meta?.color ? { backgroundColor: hexToRgba(meta.color, 0.18) } : undefined}
                          onClick={() => entry.isDirectory && onNavigate(joinRelPath(col.path, entry.name))}
                          disabled={!entry.isDirectory}
                        >
                          <span className="column-browser-icon">{entryIcon}</span>
                          <span className="column-browser-name">{entry.name}</span>
                          {entry.isDirectory && <span className="column-browser-chevron">›</span>}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
          <div className="column-browser-col">
            <ul className="column-browser-list">
              {enrichedEntries.map(({ entry, meta, kind, thumbUrl, icon }) => (
                <li key={entry.name}>
                  <button
                    className={
                      columnFileSelection === entry.name ? 'column-browser-item selected' : 'column-browser-item'
                    }
                    style={meta?.color ? { backgroundColor: hexToRgba(meta.color, 0.18) } : undefined}
                    onClick={() => {
                      if (entry.isDirectory) onNavigate(joinRelPath(currentPath, entry.name))
                      else setColumnFileSelection(entry.name)
                    }}
                    onDoubleClick={() => {
                      if (!entry.isDirectory && kind) onPreviewEntry(entry)
                    }}
                    onContextMenu={(e) => void handleEntryContextMenu(e, entry)}
                  >
                    <span className="column-browser-icon">
                      {thumbUrl ? <img src={thumbUrl} alt="" loading="lazy" /> : icon}
                    </span>
                    <span className="column-browser-name">{entry.name}</span>
                    {entry.isDirectory && <span className="column-browser-chevron">›</span>}
                  </button>
                </li>
              ))}
              {columnsLoading && <li className="column-browser-loading">読み込み中…</li>}
            </ul>
          </div>
          {columnFileSelection &&
            (() => {
              const selected = entries.find((e) => e.name === columnFileSelection)
              if (!selected) return null
              const selectedMeta = metadata[columnFileSelection]
              const selectedKind = getPreviewKind(columnFileSelection)
              const thumbSrc =
                previewBaseUrl && selectedKind === 'image'
                  ? `${previewBaseUrl}/api/download?path=${encodeURIComponent(joinRelPath(currentPath, columnFileSelection))}&inline=1`
                  : null
              return (
                <div className="column-browser-preview">
                  {thumbSrc ? (
                    <img className="column-browser-preview-media" src={thumbSrc} alt="" />
                  ) : (
                    <span className="column-browser-preview-icon">📄</span>
                  )}
                  <div className="column-browser-preview-name">{columnFileSelection}</div>
                  <div className="column-browser-preview-meta">
                    {formatBytes(selected.size)} ・ {formatDate(selected.modifiedAt)}
                  </div>
                  {selectedMeta?.memo && <div className="column-browser-preview-memo">{selectedMeta.memo}</div>}
                  <button
                    className="button primary small"
                    onClick={() => onPreviewEntry(selected)}
                    disabled={!selectedKind}
                  >
                    プレビューを開く
                  </button>
                </div>
              )
            })()}
        </div>
      ) : (
        <ul className="entry-list">
          {enrichedEntries.map(({ entry, meta, kind, thumbUrl, icon, override }) => (
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
              onContextMenu={(e) => void handleEntryContextMenu(e, entry)}
            >
              <div className="entry-row">
                {viewMode === 'details' && thumbUrl && (
                  <div className="entry-thumb">
                    <img className="entry-thumb-media" src={thumbUrl} alt="" loading="lazy" />
                  </div>
                )}
                <input
                  type="checkbox"
                  className="entry-checkbox"
                  checked={selectedNames.has(entry.name)}
                  onChange={() => toggleSelected(entry.name)}
                />
                <button
                  className="entry-main"
                  title="ダブルクリックで開く"
                  onDoubleClick={() => {
                    if (entry.isDirectory) onNavigate(joinRelPath(currentPath, entry.name))
                    else if (kind) onPreviewEntry(entry)
                  }}
                  disabled={!entry.isDirectory && !kind}
                >
                  <span className="entry-icon">{icon}</span>
                  <span className={meta?.imported ? 'entry-name entry-imported' : 'entry-name'}>{entry.name}</span>
                  {showMemoInline && meta?.memo && (
                    <span className="entry-memo-inline" title={meta.memo}>
                      {meta.memo}
                    </span>
                  )}
                  {meta?.imported && (
                    <span className="entry-badge" title="取り込み済み">
                      ✓
                    </span>
                  )}
                  {meta?.memo && !showMemoInline && (
                    <span className="entry-badge" title={meta.memo}>
                      📝
                    </span>
                  )}
                  {!entry.isDirectory && <span className="entry-size">{formatBytes(entry.size)}</span>}
                  {viewMode === 'content' && <span className="entry-date">{formatDate(entry.modifiedAt)}</span>}
                </button>
                {viewMode === 'details' && (
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
