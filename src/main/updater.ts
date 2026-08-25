// GitHub Releasesを使ったWindows向け自己更新（ダウンロード→展開→入れ替え→再起動）
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { app } from 'electron'
import extractZip from 'extract-zip'
import { isNewerVersion } from './versionCompare'

const RELEASES_API_URL = 'https://api.github.com/repos/mth1226-web/LanDrop/releases/latest'
const WINDOWS_ASSET_NAME = 'LanDrop-Windows.zip'
const USER_AGENT = 'LanDrop-Updater'

interface GithubReleaseAsset {
  name: string
  browser_download_url: string
  size: number
}

interface GithubRelease {
  tag_name: string
  assets: GithubReleaseAsset[]
}

export interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
  asset: GithubReleaseAsset | null
}

function getJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/vnd.github+json' } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          getJson<T>(res.headers.location).then(resolve, reject)
          return
        }
        if (res.statusCode !== 200) {
          res.resume()
          reject(new Error(`GitHub API returned status ${res.statusCode}`))
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T)
          } catch (err) {
            reject(err)
          }
        })
      })
      .on('error', reject)
  })
}

function downloadFile(url: string, destPath: string, onProgress?: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'user-agent': USER_AGENT } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          downloadFile(res.headers.location, destPath, onProgress).then(resolve, reject)
          return
        }
        if (res.statusCode !== 200) {
          res.resume()
          reject(new Error(`download failed with status ${res.statusCode}`))
          return
        }
        const total = Number(res.headers['content-length'] ?? 0)
        let received = 0
        const writeStream = fs.createWriteStream(destPath)
        res.on('data', (chunk: Buffer) => {
          received += chunk.length
          if (total > 0) onProgress?.(Math.round((received / total) * 100))
        })
        res.on('error', reject)
        writeStream.on('error', reject)
        writeStream.on('finish', resolve)
        res.pipe(writeStream)
      })
      .on('error', reject)
  })
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const release = await getJson<GithubRelease>(RELEASES_API_URL)
  const currentVersion = app.getVersion()
  const latestVersion = release.tag_name
  const asset = release.assets.find((a) => a.name === WINDOWS_ASSET_NAME) ?? null
  return {
    currentVersion,
    latestVersion,
    updateAvailable: isNewerVersion(currentVersion, latestVersion),
    asset
  }
}

/**
 * 新バージョンをダウンロード・展開し、実行中のexeを含むインストールフォルダを入れ替えて再起動する。
 * この関数はプロセスの終了(app.quit)で終わる想定で、正常時は戻らない。
 */
export async function downloadAndApplyUpdate(
  asset: GithubReleaseAsset,
  onProgress?: (percent: number) => void
): Promise<void> {
  if (!app.isPackaged) throw new Error('開発モードでは更新を適用できません')
  if (process.platform !== 'win32') throw new Error('この自動更新はWindows版のみ対応しています')

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'landrop-update-'))
  const zipPath = path.join(workDir, 'update.zip')
  await downloadFile(asset.browser_download_url, zipPath, onProgress)

  const extractDir = path.join(workDir, 'extracted')
  await extractZip(zipPath, { dir: extractDir })

  // zipはフォルダ名(LanDrop-Windows)を1階層含む形で作成しているため、その中身が実体
  const extractedAppDir = path.join(extractDir, 'LanDrop-Windows')
  const sourceDir = fs.existsSync(extractedAppDir) ? extractedAppDir : extractDir

  const installDir = path.dirname(process.execPath)
  const exeName = path.basename(process.execPath)
  const scriptPath = path.join(workDir, 'apply-update.bat')
  fs.writeFileSync(scriptPath, buildSwapScript(sourceDir, installDir, exeName), 'utf-8')

  spawn('cmd.exe', ['/c', scriptPath], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
  app.quit()
}

function buildSwapScript(sourceDir: string, installDir: string, exeName: string): string {
  return [
    '@echo off',
    ':wait',
    `tasklist /FI "IMAGENAME eq ${exeName}" 2>NUL | find /I "${exeName}" >NUL`,
    'if not errorlevel 1 (',
    '  timeout /t 1 /nobreak >NUL',
    '  goto wait',
    ')',
    `robocopy "${sourceDir}" "${installDir}" /E /IS /IT`,
    `start "" "${path.join(installDir, exeName)}"`,
    'del "%~f0"'
  ].join('\r\n')
}
