// バージョン文字列の比較（Electron非依存の純粋関数）
// "v1.2.3" のような先頭の v は無視し、"1.2.3" 形式のドット区切り数値として比較する

export function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '')
}

/** latestがcurrentより新しければtrue */
export function isNewerVersion(current: string, latest: string): boolean {
  const a = normalizeVersion(current).split('.').map((n) => parseInt(n, 10) || 0)
  const b = normalizeVersion(latest).split('.').map((n) => parseInt(n, 10) || 0)
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (y > x) return true
    if (y < x) return false
  }
  return false
}
