import { useEffect, useState } from 'react'
import type { PreviewSource } from '../../../shared/types'
import PreviewDialog from '../components/PreviewDialog'

export default function PreviewWindowApp(): JSX.Element {
  const [source, setSource] = useState<PreviewSource | null>(null)

  useEffect(() => {
    return window.electronAPI.onPreviewSource(setSource)
  }, [])

  useEffect(() => {
    document.title = source ? `LanDrop - プレビュー - ${source.name}` : 'LanDrop - プレビュー'
  }, [source])

  function handleShowLocalFile(file: File): void {
    setSource({ url: URL.createObjectURL(file), name: file.name })
  }

  return <PreviewDialog source={source} onShowLocalFile={handleShowLocalFile} onClose={() => window.close()} />
}
