import { useEffect, useState } from 'react'
import type { UpdateState } from '../../../shared/types'
import UpdateDialog from '../components/UpdateDialog'

export default function UpdateWindowApp(): JSX.Element {
  const [updateState, setUpdateState] = useState<UpdateState>({ phase: 'idle' })

  useEffect(() => {
    document.title = 'LanDrop - アップデート'
    void window.electronAPI.checkForUpdate()
    return window.electronAPI.onUpdateState(setUpdateState)
  }, [])

  return (
    <UpdateDialog
      updateState={updateState}
      onCheck={() => void window.electronAPI.checkForUpdate()}
      onApply={() => void window.electronAPI.applyUpdate()}
      onClose={() => window.close()}
    />
  )
}
