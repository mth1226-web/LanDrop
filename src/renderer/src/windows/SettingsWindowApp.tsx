import { useEffect, useState } from 'react'
import type { AppSettings } from '../../../shared/types'
import SettingsDialog from '../components/SettingsDialog'

export default function SettingsWindowApp(): JSX.Element | null {
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    document.title = 'LanDrop - 設定'
    window.electronAPI.getSettings().then(setSettings)
    return window.electronAPI.onSettingsChanged(setSettings)
  }, [])

  if (!settings) return null

  async function handleSaveDeviceName(deviceName: string): Promise<void> {
    setSettings(await window.electronAPI.setSettings({ deviceName }))
  }

  async function handleAddSharedFolders(paths: string[]): Promise<void> {
    setSettings(await window.electronAPI.addSharedFolders(paths))
  }

  async function handleChooseSharedFolder(): Promise<void> {
    const updated = await window.electronAPI.chooseSharedFolder()
    if (updated) setSettings(updated)
  }

  async function handleRemoveSharedFolder(folderPath: string): Promise<void> {
    setSettings(await window.electronAPI.removeSharedFolder(folderPath))
  }

  function handleOpenFolder(folderPath: string): void {
    void window.electronAPI.openFolder(folderPath)
  }

  async function handleChooseDownloadFolder(): Promise<void> {
    const updated = await window.electronAPI.chooseDownloadFolder()
    if (updated) setSettings(updated)
  }

  async function handleChangeAccentColor(color: string): Promise<void> {
    setSettings(await window.electronAPI.setAccentColor(color))
  }

  return (
    <SettingsDialog
      settings={settings}
      onSaveDeviceName={handleSaveDeviceName}
      onAddSharedFolders={handleAddSharedFolders}
      onChooseSharedFolder={handleChooseSharedFolder}
      onRemoveSharedFolder={handleRemoveSharedFolder}
      onOpenFolder={handleOpenFolder}
      onChooseDownloadFolder={handleChooseDownloadFolder}
      onChangeAccentColor={handleChangeAccentColor}
      onClose={() => window.close()}
    />
  )
}
