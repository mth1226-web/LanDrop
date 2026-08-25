import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { NetworkInterfaceOption } from '../../../shared/types'

export default function PhoneAccessCard(): JSX.Element {
  const [url, setUrl] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [interfaces, setInterfaces] = useState<NetworkInterfaceOption[]>([])
  const [selected, setSelected] = useState<string>('')

  function refreshUrl(): void {
    window.electronAPI.getLanUrl().then(setUrl)
  }

  useEffect(() => {
    refreshUrl()
    window.electronAPI.listNetworkInterfaces().then(setInterfaces)
    window.electronAPI.getSettings().then((s) => setSelected(s.preferredNetworkInterface ?? ''))
  }, [])

  useEffect(() => {
    if (!url) {
      setQrDataUrl(null)
      return
    }
    QRCode.toDataURL(url, { margin: 1, width: 150 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null))
  }, [url])

  async function handleSelectInterface(name: string): Promise<void> {
    setSelected(name)
    await window.electronAPI.setPreferredNetworkInterface(name || null)
    refreshUrl()
  }

  function handleOpenNetworkSettings(): void {
    void window.electronAPI.openNetworkSettings()
  }

  return (
    <div className="field">
      <span>スマホから開く（同じWi-Fiのブラウザでアップロード/ダウンロードできます）</span>

      <div className="network-interface-row">
        {interfaces.length > 1 && (
          <select value={selected} onChange={(e) => void handleSelectInterface(e.target.value)}>
            <option value="">自動</option>
            {interfaces.map((i) => (
              <option key={i.name} value={i.name}>
                {i.name}（{i.address}）
              </option>
            ))}
          </select>
        )}
        <button className="button secondary small" onClick={handleOpenNetworkSettings}>
          Windowsのネットワーク設定を開く
        </button>
      </div>

      {url ? (
        <div className="phone-access-body">
          {qrDataUrl && <img src={qrDataUrl} alt="QRコード" className="phone-access-qr" />}
          <code className="phone-access-url">{url}</code>
        </div>
      ) : (
        <p className="empty-hint">ネットワークアドレスを取得できませんでした</p>
      )}
    </div>
  )
}
