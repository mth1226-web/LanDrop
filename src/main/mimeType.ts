// プレビュー表示(inline)時にブラウザ側のビューア(画像/動画/音声/PDF)を正しく起動させるための拡張子->MIME判定
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  ogv: 'video/ogg',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  aac: 'audio/aac',
  weba: 'audio/webm',
  pdf: 'application/pdf'
}

export function guessMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext && MIME_BY_EXTENSION[ext]) return MIME_BY_EXTENSION[ext]
  return 'text/plain; charset=utf-8'
}
