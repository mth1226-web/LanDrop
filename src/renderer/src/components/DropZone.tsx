import { useState } from 'react'
import type { Peer } from '../../../shared/types'

interface Props {
  selectedPeer: Peer | null
  onSendFiles: (filePaths: string[]) => void
}

export default function DropZone({ selectedPeer, onSendFiles }: Props): JSX.Element {
  const [isDragOver, setIsDragOver] = useState(false)

  function handleDrop(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setIsDragOver(false)
    if (!selectedPeer) return
    const paths = Array.from(e.dataTransfer.files).map((file) => window.electronAPI.getPathForFile(file))
    if (paths.length > 0) onSendFiles(paths)
  }

  return (
    <div
      className={isDragOver ? 'drop-zone drag-over' : 'drop-zone'}
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragOver(true)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      {selectedPeer ? (
        <>
          <p className="drop-zone-title">{selectedPeer.deviceName} にファイルをドロップ</p>
          <p className="drop-zone-sub">複数ファイルをまとめて送信できます</p>
        </>
      ) : (
        <p className="drop-zone-title">左の一覧から送信先の端末を選んでください</p>
      )}
    </div>
  )
}
