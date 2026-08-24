import { useState } from 'react'

export default function FirewallHintBanner(): JSX.Element | null {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <div className="firewall-banner">
      <span>
        初回起動時にファイアウォールの確認が表示されたら「アクセスを許可する」を選んでください（同じネットワーク内の端末を見つけるために必要です）。
      </span>
      <button className="firewall-banner-close" onClick={() => setDismissed(true)} aria-label="閉じる">
        ×
      </button>
    </div>
  )
}
