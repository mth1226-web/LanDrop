import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export default function PhoneAccessCard(): JSX.Element {
  const [url, setUrl] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.getLanUrl().then(setUrl)
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

  return (
    <div className="field">
      <span>スマホから開く（同じWi-Fiのブラウザでアップロード/ダウンロードできます）</span>
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
