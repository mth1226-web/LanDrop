export type PreviewKind = 'image' | 'video'

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv'])

export function getPreviewKind(fileName: string): PreviewKind | null {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (!ext) return null
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  return null
}
