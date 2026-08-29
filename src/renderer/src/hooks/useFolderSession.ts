// 1つのピアの1つのフォルダ階層を「見て回る」ためのロジックをまとめたフック。
// メインウインドウ(PC一覧から選んだピアを表示)と、ピア固定の閲覧専用ウインドウの両方から使う。
import { useEffect, useState } from 'react'
import type { BrowseEntry, EntryMetadata, PasteMode, PreviewSource } from '../../../shared/types'
import { joinRelPath } from '../store'
import { effectiveManualOrder, moveNameInOrder, moveNameRelativeTo } from '../utils/sortEntries'

interface ClipboardState {
  peerDeviceId: string
  relPath: string
  mode: PasteMode
  entries: BrowseEntry[]
}

interface UseFolderSessionArgs {
  peerDeviceId: string | null
  previewBaseUrl: string | null
  initialPath?: string
}

export function useFolderSession({ peerDeviceId, previewBaseUrl, initialPath = '' }: UseFolderSessionArgs) {
  const [currentPath, setCurrentPath] = useState(initialPath)
  const [entries, setEntries] = useState<BrowseEntry[]>([])
  const [entryMetadata, setEntryMetadata] = useState<Record<string, EntryMetadata>>({})
  const [isLoadingEntries, setLoadingEntries] = useState(false)
  const [customOrder, setCustomOrderState] = useState<string[]>([])
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null)

  function reloadEntries(): void {
    if (!peerDeviceId) return
    setLoadingEntries(true)
    window.electronAPI
      .browseFolder(peerDeviceId, currentPath)
      .then((list) => {
        setEntries(list)
        return window.electronAPI.getEntryMetadataForChildren(
          peerDeviceId,
          currentPath,
          list.map((e) => e.name)
        )
      })
      .then(setEntryMetadata)
      .catch(() => setEntries([]))
      .finally(() => setLoadingEntries(false))
    window.electronAPI.getCustomOrder(peerDeviceId, currentPath).then(setCustomOrderState)
  }

  useEffect(() => {
    reloadEntries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerDeviceId, currentPath])

  // ピアを切り替えたら(メインウインドウでPC一覧の別の端末を選んだ場合など)ルートに戻す
  useEffect(() => {
    setCurrentPath(initialPath)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerDeviceId])

  function handleUploadFiles(filePaths: string[]): void {
    if (!peerDeviceId) return
    window.electronAPI.uploadFiles(peerDeviceId, currentPath, filePaths).then(() => reloadEntries())
  }

  function handleCreateFolder(name: string): void {
    if (!peerDeviceId) return
    window.electronAPI.createFolder(peerDeviceId, currentPath, name).then(() => reloadEntries())
  }

  function handleRename(oldName: string, newName: string): void {
    if (!peerDeviceId) return
    window.electronAPI.renameEntry(peerDeviceId, currentPath, oldName, newName).then(() => reloadEntries())
  }

  function handleDownload(selected: BrowseEntry[]): void {
    if (!peerDeviceId || selected.length === 0) return
    void window.electronAPI.downloadEntries(peerDeviceId, currentPath, selected)
  }

  function handleRevealLocal(entry: BrowseEntry): void {
    void window.electronAPI.revealLocalFile(joinRelPath(currentPath, entry.name))
  }

  function handlePreviewEntry(entry: BrowseEntry): void {
    if (!previewBaseUrl) return
    const relPath = joinRelPath(currentPath, entry.name)
    const source: PreviewSource = { url: `${previewBaseUrl}/api/download?path=${encodeURIComponent(relPath)}&inline=1`, name: entry.name }
    void window.electronAPI.openPreviewWindow(source)
  }

  async function handleSaveMetadata(entryName: string, patch: Partial<EntryMetadata>): Promise<void> {
    if (!peerDeviceId) return
    const updated = await window.electronAPI.setEntryMetadata(peerDeviceId, joinRelPath(currentPath, entryName), patch)
    setEntryMetadata((prev) => ({ ...prev, [entryName]: updated }))
    if (patch.color !== undefined) {
      // Mac実機のFinderカラータグにも反映を試みる(Windows側やMac以外の相手では静かに失敗する)
      const result = await window.electronAPI.setFinderTagColor(peerDeviceId, currentPath, entryName, patch.color)
      if (result.ok) {
        setEntries((prev) =>
          prev.map((e) => (e.name === entryName ? { ...e, finderTagColor: patch.color ?? null } : e))
        )
      }
    }
  }

  async function handleSetDownloadFolderOverride(label: string): Promise<void> {
    await window.electronAPI.chooseDownloadFolderOverride(label)
  }

  async function handleRemoveDownloadFolderOverride(label: string): Promise<void> {
    await window.electronAPI.removeDownloadFolderOverride(label)
  }

  async function handleMoveEntry(name: string, direction: 'up' | 'down'): Promise<void> {
    if (!peerDeviceId) return
    const order = effectiveManualOrder(entries, customOrder)
    const nextOrder = moveNameInOrder(order, name, direction)
    const saved = await window.electronAPI.setCustomOrder(peerDeviceId, currentPath, nextOrder)
    setCustomOrderState(saved)
  }

  async function handleReorderEntries(draggedName: string, targetName: string, after: boolean): Promise<void> {
    if (!peerDeviceId || draggedName === targetName) return
    const order = effectiveManualOrder(entries, customOrder)
    const nextOrder = moveNameRelativeTo(order, draggedName, targetName, after)
    const saved = await window.electronAPI.setCustomOrder(peerDeviceId, currentPath, nextOrder)
    setCustomOrderState(saved)
  }

  function handleCopyEntries(selected: BrowseEntry[]): void {
    if (!peerDeviceId || selected.length === 0) return
    setClipboard({ peerDeviceId, relPath: currentPath, mode: 'copy', entries: selected })
  }

  function handleCutEntries(selected: BrowseEntry[]): void {
    if (!peerDeviceId || selected.length === 0) return
    setClipboard({ peerDeviceId, relPath: currentPath, mode: 'move', entries: selected })
  }

  async function handlePasteEntries(): Promise<void> {
    if (!peerDeviceId || !clipboard || clipboard.peerDeviceId !== peerDeviceId) return
    const results = await window.electronAPI.pasteEntries(
      clipboard.peerDeviceId,
      clipboard.relPath,
      currentPath,
      clipboard.entries,
      clipboard.mode
    )
    const failed = results.filter((r) => !r.ok)
    if (failed.length > 0) {
      window.alert(`貼り付けできなかった項目があります:\n${failed.map((f) => `${f.name}: ${f.error ?? ''}`).join('\n')}`)
    }
    if (clipboard.mode === 'move') setClipboard(null)
    reloadEntries()
  }

  async function handleTrashEntries(names: string[]): Promise<void> {
    if (!peerDeviceId || names.length === 0) return
    if (!window.confirm(`${names.length}件をごみ箱に移動しますか？`)) return
    const results = await window.electronAPI.trashEntries(peerDeviceId, currentPath, names)
    const failed = results.filter((r) => !r.ok)
    if (failed.length > 0) {
      window.alert(`削除できなかった項目があります:\n${failed.map((f) => `${f.name}: ${f.error ?? ''}`).join('\n')}`)
    }
    reloadEntries()
  }

  async function handleCompressEntries(names: string[]): Promise<void> {
    if (!peerDeviceId || names.length === 0) return
    const result = await window.electronAPI.compressEntries(peerDeviceId, currentPath, names)
    if (!result.ok) window.alert(`圧縮できませんでした: ${result.error ?? ''}`)
    reloadEntries()
  }

  async function handleExtractEntry(name: string): Promise<void> {
    if (!peerDeviceId) return
    const result = await window.electronAPI.extractEntry(peerDeviceId, currentPath, name)
    if (!result.ok) window.alert(`展開できませんでした: ${result.error ?? ''}`)
    reloadEntries()
  }

  return {
    currentPath,
    setCurrentPath,
    entries,
    entryMetadata,
    isLoadingEntries,
    customOrder,
    clipboard: clipboard ? { peerDeviceId: clipboard.peerDeviceId, mode: clipboard.mode, count: clipboard.entries.length } : null,
    reloadEntries,
    handleUploadFiles,
    handleCreateFolder,
    handleRename,
    handleDownload,
    handleRevealLocal,
    handlePreviewEntry,
    handleSaveMetadata,
    handleSetDownloadFolderOverride,
    handleRemoveDownloadFolderOverride,
    handleMoveEntry,
    handleReorderEntries,
    handleCopyEntries,
    handleCutEntries,
    handlePasteEntries,
    handleTrashEntries,
    handleCompressEntries,
    handleExtractEntry
  }
}
