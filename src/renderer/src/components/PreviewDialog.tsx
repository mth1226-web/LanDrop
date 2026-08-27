import { useEffect, useState } from 'react'
import type { PreviewSource } from '../../../shared/types'
import { getPreviewKind } from '../utils/previewKind'
import { isInternalDragActive } from '../utils/internalDrag'

const TEXT_PREVIEW_MAX_CHARS = 200_000

interface Props {
  source: PreviewSource | null
  onShowLocalFile: (file: File) => void
  onClose: () => void
}

export default function PreviewDialog({ source, onShowLocalFile, onClose }: Props): JSX.Element {
  const [isDragOver, setIsDragOver] = useState(false)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [textError, setTextError] = useState(false)
  const kind = source ? getPreviewKind(source.name) : null

  useEffect(() => {
    if (!source || kind !== 'text') {
      setTextContent(null)
      setTextError(false)
      return
    }
    let cancelled = false
    setTextContent(null)
    setTextError(false)
    fetch(source.url)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status))
        return res.text()
      })
      .then((text) => {
        if (cancelled) return
        setTextContent(
          text.length > TEXT_PREVIEW_MAX_CHARS
            ? `${text.slice(0, TEXT_PREVIEW_MAX_CHARS)}\n\n…（ファイルが大きいため以降は省略しています）`
            : text
        )
      })
      .catch(() => {
        if (!cancelled) setTextError(true)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.url, kind])

  function handleDrop(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setIsDragOver(false)
    if (isInternalDragActive()) return
    const file = e.dataTransfer.files[0]
    if (file) onShowLocalFile(file)
  }

  return (
    <div className="modal-overlay">
      <div className="modal preview-dialog">
        <div className="preview-dialog-header">
          <h2>{source ? source.name : 'プレビュー'}</h2>
          <button className="button secondary small" onClick={onClose}>
            閉じる
          </button>
        </div>
        <div
          className={isDragOver ? 'preview-area drag-over' : 'preview-area'}
          onDragOver={(e) => {
            e.preventDefault()
            if (!isInternalDragActive()) setIsDragOver(true)
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          {!source && (
            <p className="empty-hint">
              一覧からファイルをクリックするか、ここにファイルをドラッグ&ドロップしてプレビューできます
            </p>
          )}
          {source && kind === 'image' && <img className="preview-media" src={source.url} alt={source.name} />}
          {source && kind === 'video' && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video className="preview-media" src={source.url} controls autoPlay />
          )}
          {source && kind === 'audio' && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <audio className="preview-audio" src={source.url} controls autoPlay />
          )}
          {source && kind === 'pdf' && <iframe className="preview-pdf" src={source.url} title={source.name} />}
          {source && kind === 'text' && (
            <div className="preview-text-wrap">
              {textError && <p className="empty-hint">ファイルを読み込めませんでした</p>}
              {!textError && textContent === null && <p className="empty-hint">読み込み中…</p>}
              {!textError && textContent !== null && <pre className="preview-text">{textContent}</pre>}
            </div>
          )}
          {source && !kind && <p className="empty-hint">このファイルはプレビューに対応していません</p>}
        </div>
      </div>
    </div>
  )
}
