import { useState } from 'react'
import type { PreviewSource } from '../../../shared/types'
import { getPreviewKind } from '../utils/previewKind'
import { isInternalDragActive } from '../utils/internalDrag'

interface Props {
  source: PreviewSource | null
  onShowLocalFile: (file: File) => void
  onClose: () => void
}

export default function PreviewDialog({ source, onShowLocalFile, onClose }: Props): JSX.Element {
  const [isDragOver, setIsDragOver] = useState(false)
  const kind = source ? getPreviewKind(source.name) : null

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
              一覧から画像/動画をクリックするか、ここにファイルをドラッグ&ドロップしてプレビューできます
            </p>
          )}
          {source && kind === 'image' && <img className="preview-media" src={source.url} alt={source.name} />}
          {source && kind === 'video' && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video className="preview-media" src={source.url} controls autoPlay />
          )}
          {source && !kind && <p className="empty-hint">このファイルはプレビューに対応していません</p>}
        </div>
      </div>
    </div>
  )
}
