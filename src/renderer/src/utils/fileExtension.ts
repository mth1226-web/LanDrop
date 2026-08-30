/** ファイル名を「拡張子を除いた部分」と「拡張子(ドット無し)」に分ける。ドットファイル(.gitignore等)は拡張子無し扱い */
export function splitFileName(name: string): { base: string; ext: string } {
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex <= 0) return { base: name, ext: '' }
  return { base: name.slice(0, dotIndex), ext: name.slice(dotIndex + 1) }
}

/** 一覧の「種類」列に出す表示用ラベル */
export function fileTypeLabel(name: string, isDirectory: boolean): string {
  if (isDirectory) return 'フォルダー'
  const { ext } = splitFileName(name)
  return ext ? `${ext.toUpperCase()} ファイル` : 'ファイル'
}
