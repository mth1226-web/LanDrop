import { app, BrowserWindow, ipcMain, dialog, shell, Menu, MenuItemConstructorOptions } from 'electron'
import { join, basename, posix } from 'path'
import { existsSync, statSync, copyFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { hostname } from 'os'
import { Discovery } from './discovery'
import { HttpServer } from './httpServer'
import { ActivityStore } from './activityStore'
import { browseFolder, createFolderRemote, renameEntryRemote, uploadFile, downloadFile, downloadZip } from './transferClient'
import { loadSettings, saveSettings } from './settings'
import { browseShared, resolveSharedEntry, createFolder, renameEntry, resolveSafePath, ensureSharedFolder } from './sharedFs'
import { resolveUniquePath } from './fileSave'
import { checkForUpdate, downloadAndApplyUpdate } from './updater'
import { getLanAddress } from './localNetwork'
import type { AppSettings, BrowseEntry, UpdateState } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let settings: AppSettings
let httpServer: HttpServer | null = null
let discovery: Discovery | null = null
let ownHttpPort = 0

const activityStore = new ActivityStore()

function getSettingsFilePath(): string {
  return join(app.getPath('userData'), 'landrop-settings.json')
}

function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args)
}

function broadcastActivity(id: string): void {
  const activity = activityStore.get(id)
  if (activity) sendToRenderer('activity-updated', activity)
}

function sendUpdateState(state: UpdateState): void {
  sendToRenderer('update-state', state)
}

async function checkForUpdateAndNotify(): Promise<void> {
  sendUpdateState({ phase: 'checking' })
  try {
    const result = await checkForUpdate()
    sendUpdateState({
      phase: result.updateAvailable ? 'available' : 'up-to-date',
      currentVersion: result.currentVersion,
      latestVersion: result.latestVersion
    })
  } catch (err) {
    sendUpdateState({ phase: 'error', errorMessage: String(err) })
  }
}

async function applyUpdateAndNotify(): Promise<void> {
  if (process.platform !== 'win32') {
    sendUpdateState({ phase: 'unsupported-platform' })
    return
  }
  try {
    const result = await checkForUpdate()
    if (!result.updateAvailable || !result.asset) {
      sendUpdateState({ phase: 'up-to-date', currentVersion: result.currentVersion, latestVersion: result.latestVersion })
      return
    }
    sendUpdateState({ phase: 'downloading', percent: 0, latestVersion: result.latestVersion })
    await downloadAndApplyUpdate(result.asset, (percent) => sendUpdateState({ phase: 'downloading', percent }))
    // 正常系はここでdownloadAndApplyUpdate内のapp.quit()によりプロセスが終了するため到達しない
  } catch (err) {
    sendUpdateState({ phase: 'error', errorMessage: String(err) })
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 760,
    minHeight: 520,
    title: 'LanDrop',
    backgroundColor: '#14141c',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function buildApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'ファイル',
      submenu: [{ role: 'quit', label: '終了' }]
    },
    {
      label: '編集',
      submenu: [
        { role: 'undo', label: '元に戻す' },
        { role: 'redo', label: 'やり直し' },
        { type: 'separator' },
        { role: 'cut', label: '切り取り' },
        { role: 'copy', label: 'コピー' },
        { role: 'paste', label: '貼り付け' },
        { role: 'selectAll', label: 'すべて選択' }
      ]
    },
    {
      label: '表示',
      submenu: [
        { role: 'reload', label: '再読み込み' },
        { role: 'toggleDevTools', label: '開発者ツール' },
        { type: 'separator' },
        { role: 'resetZoom', label: '実際のサイズ' },
        { role: 'zoomIn', label: '拡大' },
        { role: 'zoomOut', label: '縮小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'フルスクリーンに切り替え' }
      ]
    },
    {
      label: 'ウィンドウ',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'close', label: '閉じる' }
      ]
    },
    {
      label: 'ヘルプ',
      submenu: [
        {
          label: 'アップデートを確認...',
          click: () => void checkForUpdateAndNotify()
        },
        { type: 'separator' },
        {
          label: 'LanDropについて',
          click: () => {
            void dialog.showMessageBox({
              type: 'info',
              title: 'LanDropについて',
              message: 'LanDrop',
              detail: '同じLAN内のPC同士で共有フォルダを閲覧・アップロード/ダウンロードできるアプリです。'
            })
          }
        }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function startNetworking(): Promise<void> {
  httpServer = new HttpServer({
    getSharedFolders: () => settings.sharedFolders,
    getDeviceName: () => settings.deviceName
  })
  ownHttpPort = await httpServer.start(0)

  discovery = new Discovery({
    deviceId: settings.deviceId,
    deviceName: settings.deviceName,
    getHttpPort: () => ownHttpPort
  })

  httpServer.on('upload-received', (payload) => {
    sendToRenderer('peer-uploaded', payload)
  })

  discovery.on('peers-changed', (peers) => sendToRenderer('peers-changed', peers))

  discovery.start()
}

function findPeerOrThrow(peerDeviceId: string): { address: string; httpPort: number; deviceName: string } {
  if (peerDeviceId === settings.deviceId) {
    return { address: '', httpPort: 0, deviceName: settings.deviceName }
  }
  const peer = discovery?.getPeers().find((p) => p.deviceId === peerDeviceId)
  if (!peer) throw new Error('peer-not-found')
  return { address: peer.address, httpPort: peer.httpPort, deviceName: peer.deviceName }
}

/** 有効なフォルダのみを既存の共有フォルダ一覧に重複なく追加して保存する */
function addSharedFolders(paths: string[]): AppSettings {
  const validPaths = paths.filter((p) => {
    try {
      return statSync(p).isDirectory()
    } catch {
      return false
    }
  })
  const merged = Array.from(new Set([...settings.sharedFolders, ...validPaths]))
  settings = { ...settings, sharedFolders: merged }
  saveSettings(getSettingsFilePath(), settings)
  return settings
}

/** 自分の共有フォルダ群からrelPathを実パスへ解決する。見つからなければ例外を投げる */
function resolveSelfSharedEntry(relPath: string): { rootPath: string; innerRelPath: string } {
  const resolved = resolveSharedEntry(settings.sharedFolders, relPath)
  if (!resolved) throw new Error('invalid-path')
  return resolved
}

function registerIpcHandlers(): void {
  ipcMain.handle('get-peers', () => discovery?.getPeers() ?? [])

  ipcMain.handle('get-settings', () => settings)

  ipcMain.handle('set-settings', (_event, patch: { deviceName: string }) => {
    settings = { ...settings, deviceName: patch.deviceName }
    saveSettings(getSettingsFilePath(), settings)
    discovery?.setDeviceName(settings.deviceName)
    return settings
  })

  ipcMain.handle('set-accent-color', (_event, color: string) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return settings
    settings = { ...settings, accentColor: color }
    saveSettings(getSettingsFilePath(), settings)
    return settings
  })

  ipcMain.handle('choose-shared-folder', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'multiSelections'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return addSharedFolders(result.filePaths)
  })

  ipcMain.handle('add-shared-folders', (_event, paths: string[]) => addSharedFolders(paths))

  ipcMain.handle('remove-shared-folder', (_event, folderPath: string) => {
    settings = { ...settings, sharedFolders: settings.sharedFolders.filter((f) => f !== folderPath) }
    saveSettings(getSettingsFilePath(), settings)
    return settings
  })

  ipcMain.handle('choose-download-folder', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    settings = { ...settings, downloadFolder: result.filePaths[0] }
    saveSettings(getSettingsFilePath(), settings)
    return settings
  })

  ipcMain.handle('browse-folder', async (_event, args: { peerDeviceId: string; relPath: string }) => {
    if (args.peerDeviceId === settings.deviceId) {
      return browseShared(settings.sharedFolders, args.relPath)
    }
    const peer = findPeerOrThrow(args.peerDeviceId)
    return browseFolder(peer.address, peer.httpPort, args.relPath)
  })

  ipcMain.handle('create-folder', async (_event, args: { peerDeviceId: string; relPath: string; name: string }) => {
    if (args.peerDeviceId === settings.deviceId) {
      const resolved = resolveSelfSharedEntry(args.relPath)
      createFolder(resolved.rootPath, resolved.innerRelPath, args.name)
    } else {
      const peer = findPeerOrThrow(args.peerDeviceId)
      await createFolderRemote(peer.address, peer.httpPort, args.relPath, args.name)
    }
  })

  ipcMain.handle(
    'rename-entry',
    async (_event, args: { peerDeviceId: string; relPath: string; oldName: string; newName: string }) => {
      if (args.peerDeviceId === settings.deviceId) {
        const resolved = resolveSelfSharedEntry(args.relPath)
        renameEntry(resolved.rootPath, resolved.innerRelPath, args.oldName, args.newName)
      } else {
        const peer = findPeerOrThrow(args.peerDeviceId)
        await renameEntryRemote(peer.address, peer.httpPort, args.relPath, args.oldName, args.newName)
      }
    }
  )

  ipcMain.handle('open-folder', (_event, folderPath: string) => {
    void shell.openPath(folderPath)
  })

  ipcMain.handle('reveal-local-file', (_event, args: { relPath: string }) => {
    const resolved = resolveSharedEntry(settings.sharedFolders, args.relPath)
    const target = resolved ? resolveSafePath(resolved.rootPath, resolved.innerRelPath) : null
    if (target) shell.showItemInFolder(target)
  })

  ipcMain.handle(
    'upload-files',
    async (_event, args: { peerDeviceId: string; relPath: string; filePaths: string[] }) => {
      if (args.peerDeviceId === settings.deviceId) {
        let dir: string
        try {
          const resolved = resolveSelfSharedEntry(args.relPath)
          dir = resolveSafePath(resolved.rootPath, resolved.innerRelPath) ?? ''
          if (!dir) throw new Error('invalid-path')
        } catch {
          return { ok: false, error: 'invalid-path' }
        }
        for (const filePath of args.filePaths) {
          const dest = resolveUniquePath(dir, basename(filePath))
          copyFileSync(filePath, dest)
        }
        return { ok: true }
      }

      const peer = findPeerOrThrow(args.peerDeviceId)
      for (const filePath of args.filePaths) {
        const stat = statSync(filePath)
        const id = randomUUID()
        activityStore.create({
          id,
          direction: 'upload',
          peerDeviceId: args.peerDeviceId,
          peerDeviceName: peer.deviceName,
          fileName: basename(filePath),
          totalBytes: stat.size,
          now: Date.now()
        })
        broadcastActivity(id)
        try {
          await uploadFile({
            address: peer.address,
            port: peer.httpPort,
            relPath: args.relPath,
            name: basename(filePath),
            filePath,
            size: stat.size,
            onProgress: (transferred) => {
              activityStore.updateProgress(id, transferred)
              broadcastActivity(id)
            }
          })
          activityStore.complete(id)
        } catch (err) {
          activityStore.fail(id, String(err))
        }
        broadcastActivity(id)
      }
      return { ok: true }
    }
  )

  ipcMain.handle(
    'download-file',
    async (_event, args: { peerDeviceId: string; relPath: string; fileName: string; size: number }) => {
      const peer = findPeerOrThrow(args.peerDeviceId)
      const destPath = resolveUniquePath(settings.downloadFolder, args.fileName)
      const id = randomUUID()
      activityStore.create({
        id,
        direction: 'download',
        peerDeviceId: args.peerDeviceId,
        peerDeviceName: peer.deviceName,
        fileName: args.fileName,
        totalBytes: args.size,
        now: Date.now()
      })
      broadcastActivity(id)
      try {
        await downloadFile({
          address: peer.address,
          port: peer.httpPort,
          relPath: args.relPath,
          destPath,
          onProgress: (transferred) => {
            activityStore.updateProgress(id, transferred)
            broadcastActivity(id)
          }
        })
        activityStore.complete(id)
      } catch (err) {
        activityStore.fail(id, String(err))
      }
      broadcastActivity(id)
      return { ok: true }
    }
  )

  ipcMain.handle(
    'download-entries',
    async (_event, args: { peerDeviceId: string; relPath: string; entries: BrowseEntry[] }) => {
      const peer = findPeerOrThrow(args.peerDeviceId)

      // ファイル1件だけの選択は、zip化せず直接ダウンロードする(高速・シンプル)
      if (args.entries.length === 1 && !args.entries[0].isDirectory) {
        const entry = args.entries[0]
        const destPath = resolveUniquePath(settings.downloadFolder, entry.name)
        const id = randomUUID()
        activityStore.create({
          id,
          direction: 'download',
          peerDeviceId: args.peerDeviceId,
          peerDeviceName: peer.deviceName,
          fileName: entry.name,
          totalBytes: entry.size,
          now: Date.now()
        })
        broadcastActivity(id)
        try {
          await downloadFile({
            address: peer.address,
            port: peer.httpPort,
            relPath: posix.join(args.relPath, entry.name),
            destPath,
            onProgress: (transferred) => {
              activityStore.updateProgress(id, transferred)
              broadcastActivity(id)
            }
          })
          activityStore.complete(id)
        } catch (err) {
          activityStore.fail(id, String(err))
        }
        broadcastActivity(id)
        return { ok: true }
      }

      // 複数選択、またはフォルダを含む場合はzipにまとめてダウンロードする
      const zipName =
        args.entries.length === 1 ? `${args.entries[0].name}.zip` : `LanDrop-download-${Date.now()}.zip`
      const destPath = resolveUniquePath(settings.downloadFolder, zipName)
      const totalBytes = args.entries.reduce((sum, e) => sum + e.size, 0)
      const id = randomUUID()
      activityStore.create({
        id,
        direction: 'download',
        peerDeviceId: args.peerDeviceId,
        peerDeviceName: peer.deviceName,
        fileName: zipName,
        totalBytes,
        now: Date.now()
      })
      broadcastActivity(id)
      try {
        await downloadZip({
          address: peer.address,
          port: peer.httpPort,
          relPaths: args.entries.map((e) => posix.join(args.relPath, e.name)),
          destPath,
          onProgress: (transferred) => {
            activityStore.updateProgress(id, transferred)
            broadcastActivity(id)
          }
        })
        activityStore.complete(id)
      } catch (err) {
        activityStore.fail(id, String(err))
      }
      broadcastActivity(id)
      return { ok: true }
    }
  )

  ipcMain.handle('check-for-update', () => checkForUpdateAndNotify())
  ipcMain.handle('apply-update', () => applyUpdateAndNotify())

  ipcMain.handle('get-lan-url', () => {
    const address = getLanAddress()
    return address && ownHttpPort ? `http://${address}:${ownHttpPort}/` : null
  })
}

function loadOrInitSettings(): AppSettings {
  const filePath = getSettingsFilePath()
  const isFirstRun = !existsSync(filePath)
  const defaults: AppSettings = {
    deviceId: randomUUID(),
    deviceName: hostname(),
    sharedFolders: [join(app.getPath('documents'), 'LanDrop共有')],
    downloadFolder: app.getPath('downloads'),
    accentColor: '#4caf6a'
  }
  const loaded = loadSettings(filePath, defaults)
  if (isFirstRun) saveSettings(filePath, loaded)
  for (const folder of loaded.sharedFolders) {
    try {
      ensureSharedFolder(folder)
    } catch {
      // 外部ドライブが外れている等で作成できない共有フォルダは無視する（一覧上は空フォルダ扱いになる）
    }
  }
  return loaded
}

app.whenReady().then(async () => {
  buildApplicationMenu()
  settings = loadOrInitSettings()
  mainWindow = createWindow()
  registerIpcHandlers()
  await startNetworking()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  discovery?.stop()
  void httpServer?.stop()
})
