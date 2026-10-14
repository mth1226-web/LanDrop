import { parseFile } from 'music-metadata'
import type { MediaInfo } from '../shared/types'

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'weba'])

function extensionOf(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? ''
}

/** 詳細モードの映像/音声情報欄用。外部バイナリ(ffmpeg等)を使わないため、動画は解像度・fps・映像コーデックまでは取得できない */
export function isProbeableMedia(fileName: string): boolean {
  const ext = extensionOf(fileName)
  return VIDEO_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext)
}

export async function probeMediaInfo(absolutePath: string, fileName: string): Promise<MediaInfo> {
  if (!isProbeableMedia(fileName)) {
    return {
      status: 'unsupported',
      container: null,
      videoCodec: null,
      audioCodec: null,
      width: null,
      height: null,
      durationSec: null,
      fps: null,
      bitrateKbps: null
    }
  }
  try {
    const meta = await parseFile(absolutePath, { duration: true })
    const { format } = meta
    return {
      status: 'ok',
      container: format.container ?? null,
      // music-metadataは音声メタデータ中心のライブラリで、映像コーデック・解像度・fpsは取得できない
      videoCodec: null,
      audioCodec: format.hasAudio ? (format.codec ?? null) : null,
      width: null,
      height: null,
      durationSec: typeof format.duration === 'number' ? format.duration : null,
      fps: null,
      bitrateKbps: typeof format.bitrate === 'number' ? format.bitrate / 1000 : null
    }
  } catch {
    return {
      status: 'error',
      container: null,
      videoCodec: null,
      audioCodec: null,
      width: null,
      height: null,
      durationSec: null,
      fps: null,
      bitrateKbps: null
    }
  }
}
