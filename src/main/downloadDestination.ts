// フォルダ別ダウンロード先の解決（Electron非依存の純粋関数）
// ダウンロード先は「ルート直下の共有フォルダのラベル」単位でしか個別設定できない。
// ルート階層で複数の異なるトップフォルダを同時選択した場合は、1つのzipにまとまるため
// 個別設定を割り当てられない(共通のダウンロード先にフォールバックする)。

export function resolveDownloadDestination(
  relPath: string,
  entryNames: string[],
  overrides: Record<string, string>,
  fallback: string
): string {
  if (relPath) {
    const topLevelLabel = relPath.split('/')[0]
    return overrides[topLevelLabel] ?? fallback
  }
  if (entryNames.length === 1) {
    return overrides[entryNames[0]] ?? fallback
  }
  return fallback
}
