import { useState } from 'react'

interface Props {
  title: string
  label: string
  initialValue?: string
  confirmLabel?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

export default function InputDialog({ title, label, initialValue = '', confirmLabel = 'OK', onConfirm, onCancel }: Props): JSX.Element {
  const [value, setValue] = useState(initialValue)

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault()
    const trimmed = value.trim()
    if (trimmed) onConfirm(trimmed)
  }

  return (
    <div className="modal-overlay">
      <form className="modal input-dialog" onSubmit={handleSubmit}>
        <h2>{title}</h2>
        <label className="field">
          <span>{label}</span>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onCancel}>
            キャンセル
          </button>
          <button type="submit" className="button primary" disabled={!value.trim()}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
