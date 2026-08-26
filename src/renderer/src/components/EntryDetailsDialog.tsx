import { useState } from 'react'
import type { EntryMetadata } from '../../../shared/types'

const COLOR_PRESETS = ['#4caf6a', '#5878e8', '#e0a030', '#d05a5a', '#a05ae0', '#30b8c0', '#e05a9c']

interface Props {
  entryName: string
  metadata: EntryMetadata
  onSave: (patch: Partial<EntryMetadata>) => void
  onClose: () => void
}

export default function EntryDetailsDialog({ entryName, metadata, onSave, onClose }: Props): JSX.Element {
  const [color, setColor] = useState<string | null>(metadata.color)
  const [memo, setMemo] = useState(metadata.memo)
  const [imported, setImported] = useState(metadata.imported)
  const [hidden, setHidden] = useState(metadata.hidden)

  function handleSave(): void {
    onSave({ color, memo, imported, hidden })
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal entry-details-dialog">
        <h2>{entryName}</h2>

        <div className="field">
          <span>色分け</span>
          <div className="accent-color-row">
            <button
              className={color === null ? 'accent-swatch none selected' : 'accent-swatch none'}
              aria-label="色なし"
              onClick={() => setColor(null)}
            >
              ×
            </button>
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                className={c === color ? 'accent-swatch selected' : 'accent-swatch'}
                style={{ backgroundColor: c }}
                aria-label={c}
                onClick={() => setColor(c)}
              />
            ))}
            <input type="color" className="accent-color-picker" value={color ?? '#888888'} onChange={(e) => setColor(e.target.value)} />
          </div>
        </div>

        <label className="field">
          <span>メモ</span>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <textarea autoFocus className="entry-memo-textarea" rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>

        <label className="field checkbox-field">
          <input type="checkbox" checked={imported} onChange={(e) => setImported(e.target.checked)} />
          <span>取り込み済みにする</span>
        </label>

        <label className="field checkbox-field">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          <span>一覧から非表示にする</span>
        </label>

        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            キャンセル
          </button>
          <button className="button primary" onClick={handleSave}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
