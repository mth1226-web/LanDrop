import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, Menu, MenuItemConstructorOptions } from 'electron'
import { join, basename, posix } from 'path'
import { existsSync, statSync, cpSync, rmSync, createWriteStream } from 'fs'
import { randomUUID } from 'crypto'
import { hostname, tmpdir } from 'os'
import archiver from 'archiver'
import { Discovery } from './discovery'
import { HttpServer } from './httpServer'
import { ActivityStore } from './activityStore'
import {
  browseFolder,
  createFolderRemote,
  renameEntryRemote,
  pasteRemote,
  trashRemote,
  compressRemote,
  extractRemote,
  uploadFile,
  uploadZip,
  downloadFile,
  downloadZip,
  sendChatMessage
} from './transferClient'
import { loadSettings, saveSettings } from './settings'
import {
  browseShared,
  resolveSharedEntry,
  createFolder,
  renameEntry,
  resolveSafePath,
  ensureSharedFolder,
  copyEntry,
  moveEntry,
  compressEntries,
  extractZipEntry
} from './sharedFs'
import { resolveUniquePath } from './fileSave'
import { checkForUpdate, downloadAndApplyUpdate } from './updater'
import { getLanAddress, getLanInterfaces } from './localNetwork'
import {
  entryMetadataKey,
  loadEntryMetadataStore,
  saveEntryMetadataStore,
  setEntryMetadata,
  getEntryMetadataForChildren
} from './entryMetadata'
import type { EntryMetadataStore } from './entryMetadata'
import { resolveDownloadDestination } from './downloadDestination'
import {
  loadChatStore,
  saveChatStore,
  appendBroadcastMessage,
  appendDirectMessage,
  clearBroadcastLog,
  clearDirectLog,
  getBroadcastLog,
  getDirectLog
} from './chatStore'
import type { ChatStore } from './chatStore'
import { sortOrderKey, loadSortOrderStore, saveSortOrderStore, getCustomOrder, setCustomOrder } from './sortOrderStore'
import type { SortOrderStore } from './sortOrderStore'
import type { AppSettings, BrowseEntry, ChatMessage, UpdateState, ViewMode } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let chatWindow: BrowserWindow | null = null
let updateWindow: BrowserWindow | null = null
let previewWindow: BrowserWindow | null = null
let browseWindows: BrowserWindow[] = []
let settings: AppSettings
let httpServer: HttpServer | null = null
let discovery: Discovery | null = null
let ownHttpPort = 0
let entryMetadataStore: EntryMetadataStore = {}
let chatStore: ChatStore = { broadcast: [], direct: {} }
let sortOrderStore: SortOrderStore = {}

const activityStore = new ActivityStore()

function getSettingsFilePath(): string {
  return join(app.getPath('userData'), 'landrop-settings.json')
}

function getEntryMetadataFilePath(): string {
  return join(app.getPath('userData'), 'landrop-entry-metadata.json')
}

function getChatFilePath(): string {
  return join(app.getPath('userData'), 'landrop-chat.json')
}

function getSortOrderFilePath(): string {
  return join(app.getPath('userData'), 'landrop-sort-order.json')
}

/** 開いている全ウィンドウ(メイン+設定/チャット/アップデート/プレビューの各子ウィンドウ)へ送る */
function sendToRenderer(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args)
  }
}

/** 設定を更新・保存し、変更を全ウィンドウへ通知したうえで返す */
function updateSettings(next: AppSettings): AppSettings {
  settings = next
  saveSettings(getSettingsFilePath(), settings)
  sendToRenderer('settings-changed', settings)
  return settings
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

/** レンダラーの同一index.htmlを、URLハッシュ(#settings等)で表示内容を切り替えて読み込む */
function loadRoute(win: BrowserWindow, route: string): void {
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}${route ? `#${route}` : ''}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), route ? { hash: route } : undefined)
  }
}

function createWindow(
  route: string,
  options: Partial<Electron.BrowserWindowConstructorOptions> = {}
): BrowserWindow {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 760,
    minHeight: 520,
    title: 'LanDrop',
    backgroundColor: '#14141c',
    ...options,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // PDFプレビュー(<iframe>)でChromium内蔵のPDFビューアを使うために必要
      plugins: true
    }
  })

  win.on('ready-to-show', () => win.show())
  loadRoute(win, route)

  return win
}

function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return
  }
  settingsWindow = createWindow('settings', {
    width: 480,
    height: 760,
    minWidth: 420,
    minHeight: 500,
    title: 'LanDrop - 設定'
  })
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}

function openChatWindow(): void {
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.focus()
    return
  }
  chatWindow = createWindow('chat', {
    width: 680,
    height: 560,
    minWidth: 480,
    minHeight: 400,
    title: 'LanDrop - チャット'
  })
  chatWindow.on('closed', () => {
    chatWindow = null
  })
}

function openUpdateWindow(): void {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.focus()
    return
  }
  updateWindow = createWindow('update', {
    width: 440,
    height: 300,
    minWidth: 440,
    minHeight: 300,
    resizable: false,
    title: 'LanDrop - アップデート'
  })
  updateWindow.on('closed', () => {
    updateWindow = null
  })
}

/** ピア固定・PC一覧やヘッダーメニューなしの閲覧専用ウインドウ。何個でも同時に開ける */
function openBrowseWindow(peerDeviceId: string, path: string): void {
  const route = `browse?peer=${encodeURIComponent(peerDeviceId)}&path=${encodeURIComponent(path)}`
  const win = createWindow(route, {
    width: 800,
    height: 600,
    minWidth: 480,
    minHeight: 360,
    title: 'LanDrop'
  })
  browseWindows.push(win)
  win.on('closed', () => {
    browseWindows = browseWindows.filter((w) => w !== win)
  })
}

function openPreviewWindow(source: { url: string; name: string } | null): void {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.focus()
    if (source) previewWindow.webContents.send('preview-source', source)
    return
  }
  previewWindow = createWindow('preview', {
    width: 900,
    height: 680,
    minWidth: 480,
    minHeight: 400,
    title: 'LanDrop - プレビュー'
  })
  previewWindow.on('closed', () => {
    previewWindow = null
  })
  if (source) {
    previewWindow.webContents.once('did-finish-load', () => {
      previewWindow?.webContents.send('preview-source', source)
    })
  }
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
    getDeviceName: () => settings.deviceName,
    trashPath: (absPath) => shell.trashItem(absPath)
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

  httpServer.on('chat-received', (message) => {
    chatStore = appendDirectMessage(chatStore, message.fromDeviceId, message)
    saveChatStore(getChatFilePath(), chatStore)
    sendToRenderer('chat-message', { target: message.fromDeviceId, message })
  })

  discovery.on('peers-changed', (peers) => sendToRenderer('peers-changed', peers))

  discovery.on('chat', (message) => {
    chatStore = appendBroadcastMessage(chatStore, message)
    saveChatStore(getChatFilePath(), chatStore)
    sendToRenderer('chat-message', { target: 'broadcast', message })
  })

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
  return updateSettings({ ...settings, sharedFolders: merged })
}

/** 自分の共有フォルダ群からrelPathを実パスへ解決する。見つからなければ例外を投げる */
function resolveSelfSharedEntry(relPath: string): { rootPath: string; innerRelPath: string } {
  const resolved = resolveSharedEntry(settings.sharedFolders, relPath)
  if (!resolved) throw new Error('invalid-path')
  return resolved
}

/**
 * 貼り付け(コピー/移動)を1件実行し、実際に付いたファイル名を返す。
 * 現状は「同じ端末(自分 or 特定の1台のリモート)の共有フォルダ内」のみ対応。
 * 別々の2台のリモート間や、自分↔リモートをまたいだ貼り付けは今後の拡張。
 */
async function pasteOneEntry(
  peerDeviceId: string,
  srcRelPath: string,
  entry: BrowseEntry,
  destRelPath: string,
  mode: 'copy' | 'move'
): Promise<string> {
  if (peerDeviceId === settings.deviceId) {
    const src = resolveSelfSharedEntry(srcRelPath)
    const dest = resolveSelfSharedEntry(destRelPath)
    return mode === 'move'
      ? moveEntry(src.rootPath, src.innerRelPath, entry.name, dest.rootPath, dest.innerRelPath)
      : copyEntry(src.rootPath, src.innerRelPath, entry.name, dest.rootPath, dest.innerRelPath)
  }
  const peer = findPeerOrThrow(peerDeviceId)
  const result = await pasteRemote(peer.address, peer.httpPort, srcRelPath, entry.name, destRelPath, mode)
  return result.name
}

/** 選択したエントリを同じ場所にzipとしてまとめる。実際に付いたzipのファイル名を返す */
async function compressEntriesFor(peerDeviceId: string, relPath: string, names: string[]): Promise<string> {
  if (peerDeviceId === settings.deviceId) {
    const resolved = resolveSelfSharedEntry(relPath)
    return compressEntries(resolved.rootPath, resolved.innerRelPath, names)
  }
  const peer = findPeerOrThrow(peerDeviceId)
  const result = await compressRemote(peer.address, peer.httpPort, relPath, names)
  return result.name
}

/** zipファイルを同じ場所に展開する。実際に付いたフォルダ名を返す */
async function extractZipEntryFor(peerDeviceId: string, relPath: string, name: string): Promise<string> {
  if (peerDeviceId === settings.deviceId) {
    const resolved = resolveSelfSharedEntry(relPath)
    return extractZipEntry(resolved.rootPath, resolved.innerRelPath, name)
  }
  const peer = findPeerOrThrow(peerDeviceId)
  const result = await extractRemote(peer.address, peer.httpPort, relPath, name)
  return result.name
}

function registerIpcHandlers(): void {
  ipcMain.handle('get-peers', () => discovery?.getPeers() ?? [])

  ipcMain.handle('get-settings', () => settings)

  ipcMain.handle('set-settings', (_event, patch: { deviceName: string }) => {
    const next = updateSettings({ ...settings, deviceName: patch.deviceName })
    discovery?.setDeviceName(next.deviceName)
    return next
  })

  ipcMain.handle('set-accent-color', (_event, color: string) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return settings
    return updateSettings({ ...settings, accentColor: color })
  })

  ipcMain.handle('set-sort-mode', (_event, mode: 'name' | 'date' | 'manual') => {
    return updateSettings({ ...settings, sortMode: mode })
  })

  ipcMain.handle('set-view-mode', (_event, mode: ViewMode) => {
    return updateSettings({ ...settings, viewMode: mode })
  })

  ipcMain.handle(
    'show-entry-context-menu',
    (event, items: { id: string; label: string; disabled?: boolean }[]) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      return new Promise<string | null>((resolve) => {
        let resolved = false
        const template = items.map((item) =>
          item.id === '__separator__'
            ? { type: 'separator' as const }
            : {
                label: item.label,
                enabled: !item.disabled,
                click: () => {
                  resolved = true
                  resolve(item.id)
                }
              }
        )
        const menu = Menu.buildFromTemplate(template)
        menu.popup({
          window: win ?? undefined,
          callback: () => {
            if (!resolved) resolve(null)
          }
        })
      })
    }
  )

  ipcMain.handle('get-custom-order', (_event, args: { peerDeviceId: string; relPath: string }) =>
    getCustomOrder(sortOrderStore, sortOrderKey(args.peerDeviceId, args.relPath))
  )

  ipcMain.handle(
    'set-custom-order',
    (_event, args: { peerDeviceId: string; relPath: string; order: string[] }) => {
      const key = sortOrderKey(args.peerDeviceId, args.relPath)
      sortOrderStore = setCustomOrder(sortOrderStore, key, args.order)
      saveSortOrderStore(getSortOrderFilePath(), sortOrderStore)
      return getCustomOrder(sortOrderStore, key)
    }
  )

  ipcMain.handle('choose-shared-folder', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender) ?? mainWindow
    if (!owner) return null
    const result = await dialog.showOpenDialog(owner, { properties: ['openDirectory', 'multiSelections'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return addSharedFolders(result.filePaths)
  })

  ipcMain.handle('add-shared-folders', (_event, paths: string[]) => addSharedFolders(paths))

  ipcMain.handle('remove-shared-folder', (_event, folderPath: string) => {
    return updateSettings({ ...settings, sharedFolders: settings.sharedFolders.filter((f) => f !== folderPath) })
  })

  ipcMain.handle('choose-download-folder', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender) ?? mainWindow
    if (!owner) return null
    const result = await dialog.showOpenDialog(owner, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return updateSettings({ ...settings, downloadFolder: result.filePaths[0] })
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

  ipcMain.handle(
    'paste-entries',
    async (
      _event,
      args: { peerDeviceId: string; srcRelPath: string; destRelPath: string; entries: BrowseEntry[]; mode: 'copy' | 'move' }
    ) => {
      const results: { name: string; ok: boolean; error?: string }[] = []
      for (const entry of args.entries) {
        try {
          const finalName = await pasteOneEntry(args.peerDeviceId, args.srcRelPath, entry, args.destRelPath, args.mode)
          results.push({ name: finalName, ok: true })
        } catch (err) {
          results.push({ name: entry.name, ok: false, error: String(err) })
        }
      }
      return results
    }
  )

  ipcMain.handle(
    'trash-entries',
    async (_event, args: { peerDeviceId: string; relPath: string; names: string[] }) => {
      const results: { name: string; ok: boolean; error?: string }[] = []
      for (const name of args.names) {
        try {
          if (args.peerDeviceId === settings.deviceId) {
            const resolved = resolveSelfSharedEntry(args.relPath)
            const parent = resolveSafePath(resolved.rootPath, resolved.innerRelPath)
            const target = parent ? join(parent, name) : null
            if (!target || !existsSync(target)) throw new Error('not-found')
            await shell.trashItem(target)
          } else {
            const peer = findPeerOrThrow(args.peerDeviceId)
            await trashRemote(peer.address, peer.httpPort, args.relPath, name)
          }
          results.push({ name, ok: true })
        } catch (err) {
          results.push({ name, ok: false, error: String(err) })
        }
      }
      return results
    }
  )

  ipcMain.handle(
    'compress-entries',
    async (_event, args: { peerDeviceId: string; relPath: string; names: string[] }) => {
      try {
        const name = await compressEntriesFor(args.peerDeviceId, args.relPath, args.names)
        return { ok: true, name }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    }
  )

  ipcMain.handle(
    'extract-entry',
    async (_event, args: { peerDeviceId: string; relPath: string; name: string }) => {
      try {
        const name = await extractZipEntryFor(args.peerDeviceId, args.relPath, args.name)
        return { ok: true, name }
      } catch (err) {
        return { ok: false, error: String(err) }
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
          cpSync(filePath, dest, { recursive: true })
        }
        return { ok: true }
      }

      const peer = findPeerOrThrow(args.peerDeviceId)

      // ファイル1件だけ(フォルダを含まない)の場合は直接アップロードする(高速・シンプル)
      if (args.filePaths.length === 1 && !statSync(args.filePaths[0]).isDirectory()) {
        const filePath = args.filePaths[0]
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
        return { ok: true }
      }

      // 複数選択、またはフォルダを含む場合はzipにまとめてアップロードする(サーバー側で展開して配置)
      const tempZipPath = join(tmpdir(), `landrop-upload-${randomUUID()}.zip`)
      await new Promise<void>((resolve, reject) => {
        const output = createWriteStream(tempZipPath)
        const archive = archiver('zip', { zlib: { level: 6 } })
        output.on('close', () => resolve())
        archive.on('error', reject)
        archive.pipe(output)
        for (const filePath of args.filePaths) {
          const name = basename(filePath)
          if (statSync(filePath).isDirectory()) archive.directory(filePath, name)
          else archive.file(filePath, { name })
        }
        void archive.finalize()
      })

      const zipStat = statSync(tempZipPath)
      const id = randomUUID()
      activityStore.create({
        id,
        direction: 'upload',
        peerDeviceId: args.peerDeviceId,
        peerDeviceName: peer.deviceName,
        fileName: args.filePaths.length === 1 ? basename(args.filePaths[0]) : `${args.filePaths.length}件`,
        totalBytes: zipStat.size,
        now: Date.now()
      })
      broadcastActivity(id)
      try {
        await uploadZip({
          address: peer.address,
          port: peer.httpPort,
          relPath: args.relPath,
          zipFilePath: tempZipPath,
          size: zipStat.size,
          onProgress: (transferred) => {
            activityStore.updateProgress(id, transferred)
            broadcastActivity(id)
          }
        })
        activityStore.complete(id)
      } catch (err) {
        activityStore.fail(id, String(err))
      } finally {
        rmSync(tempZipPath, { force: true })
      }
      broadcastActivity(id)
      return { ok: true }
    }
  )

  ipcMain.handle(
    'download-file',
    async (_event, args: { peerDeviceId: string; relPath: string; fileName: string; size: number }) => {
      const peer = findPeerOrThrow(args.peerDeviceId)
      const destFolder = resolveDownloadDestination(args.relPath, [args.fileName], settings.downloadFolderOverrides, settings.downloadFolder)
      const destPath = resolveUniquePath(destFolder, args.fileName)
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

      const destFolder = resolveDownloadDestination(
        args.relPath,
        args.entries.map((e) => e.name),
        settings.downloadFolderOverrides,
        settings.downloadFolder
      )

      // ファイル1件だけの選択は、zip化せず直接ダウンロードする(高速・シンプル)
      if (args.entries.length === 1 && !args.entries[0].isDirectory) {
        const entry = args.entries[0]
        const destPath = resolveUniquePath(destFolder, entry.name)
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
      const destPath = resolveUniquePath(destFolder, zipName)
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

  // アドレスバー表示用。自分の共有フォルダのみ実際の絶対パスを解決できる(相手PCの実パスは分からないためnull)
  ipcMain.handle('resolve-absolute-path', (_event, args: { peerDeviceId: string; relPath: string }) => {
    if (args.peerDeviceId !== settings.deviceId || !args.relPath) return null
    const resolved = resolveSharedEntry(settings.sharedFolders, args.relPath)
    if (!resolved) return null
    return resolveSafePath(resolved.rootPath, resolved.innerRelPath)
  })

  ipcMain.handle('get-lan-url', () => {
    const address = getLanAddress(settings.preferredNetworkInterface)
    return address && ownHttpPort ? `http://${address}:${ownHttpPort}/` : null
  })

  // 自分の共有フォルダのプレビュー(画像/動画/音声/PDF/テキスト)用。ループバックなのでネットワークインターフェースの有無に依存しない
  ipcMain.handle('get-own-preview-base-url', () => (ownHttpPort ? `http://127.0.0.1:${ownHttpPort}` : null))

  ipcMain.handle('list-network-interfaces', () => getLanInterfaces())

  ipcMain.handle('set-preferred-network-interface', (_event, name: string | null) => {
    return updateSettings({ ...settings, preferredNetworkInterface: name })
  })

  ipcMain.handle('open-network-settings', () => {
    if (process.platform === 'win32') {
      void shell.openExternal('ms-settings:network-status')
    } else if (process.platform === 'darwin') {
      void shell.openExternal('x-apple.systempreferences:com.apple.preference.network')
    }
  })

  ipcMain.handle(
    'get-entry-metadata-for-children',
    (_event, args: { peerDeviceId: string; parentRelPath: string; childNames: string[] }) =>
      getEntryMetadataForChildren(entryMetadataStore, args.peerDeviceId, args.parentRelPath, args.childNames)
  )

  ipcMain.handle(
    'set-entry-metadata',
    (
      _event,
      args: { peerDeviceId: string; relPath: string; patch: { hidden?: boolean; color?: string | null; memo?: string; imported?: boolean } }
    ) => {
      const key = entryMetadataKey(args.peerDeviceId, args.relPath)
      entryMetadataStore = setEntryMetadata(entryMetadataStore, key, args.patch)
      saveEntryMetadataStore(getEntryMetadataFilePath(), entryMetadataStore)
      return getEntryMetadataForChildren(entryMetadataStore, args.peerDeviceId, '', [args.relPath])[args.relPath]
    }
  )

  ipcMain.handle('choose-download-folder-override', async (event, label: string) => {
    const owner = BrowserWindow.fromWebContents(event.sender) ?? mainWindow
    if (!owner) return settings
    const result = await dialog.showOpenDialog(owner, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return settings
    return updateSettings({
      ...settings,
      downloadFolderOverrides: { ...settings.downloadFolderOverrides, [label]: result.filePaths[0] }
    })
  })

  ipcMain.handle('remove-download-folder-override', (_event, label: string) => {
    const next = { ...settings.downloadFolderOverrides }
    delete next[label]
    return updateSettings({ ...settings, downloadFolderOverrides: next })
  })

  // 自分の共有フォルダ内のファイル/フォルダをOS(エクスプローラー等)へネイティブドラッグでコピーする
  ipcMain.on('start-drag', (event, relPath: string) => {
    const resolved = resolveSharedEntry(settings.sharedFolders, relPath)
    const target = resolved ? resolveSafePath(resolved.rootPath, resolved.innerRelPath) : null
    if (!target || !existsSync(target)) return
    event.sender.startDrag({
      file: target,
      icon: nativeImage.createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
      )
    })
  })

  ipcMain.handle('get-chat-log', (_event, target: string) =>
    target === 'broadcast' ? getBroadcastLog(chatStore) : getDirectLog(chatStore, target)
  )

  ipcMain.handle('send-chat-message', async (_event, args: { target: string; text: string }) => {
    const message: ChatMessage = {
      id: randomUUID(),
      fromDeviceId: settings.deviceId,
      fromDeviceName: settings.deviceName,
      text: args.text,
      timestamp: Date.now()
    }

    if (args.target === 'broadcast') {
      chatStore = appendBroadcastMessage(chatStore, message)
      saveChatStore(getChatFilePath(), chatStore)
      discovery?.broadcastChat(message)
      return message
    }

    chatStore = appendDirectMessage(chatStore, args.target, message)
    saveChatStore(getChatFilePath(), chatStore)
    try {
      const peer = findPeerOrThrow(args.target)
      await sendChatMessage(peer.address, peer.httpPort, message)
    } catch {
      // 相手がオフライン等で送れなかった場合も、自分のログには残す(既にappendDirectMessage済み)
    }
    return message
  })

  ipcMain.handle('clear-chat-log', (_event, target: string) => {
    chatStore = target === 'broadcast' ? clearBroadcastLog(chatStore) : clearDirectLog(chatStore, target)
    saveChatStore(getChatFilePath(), chatStore)
  })

  ipcMain.handle('open-settings-window', () => openSettingsWindow())
  ipcMain.handle('open-chat-window', () => openChatWindow())
  ipcMain.handle('open-update-window', () => openUpdateWindow())
  ipcMain.handle('open-preview-window', (_event, source: { url: string; name: string } | null) =>
    openPreviewWindow(source)
  )
  ipcMain.handle('open-browse-window', (_event, args: { peerDeviceId: string; path: string }) =>
    openBrowseWindow(args.peerDeviceId, args.path)
  )
}

function loadOrInitSettings(): AppSettings {
  const filePath = getSettingsFilePath()
  const isFirstRun = !existsSync(filePath)
  const defaults: AppSettings = {
    deviceId: randomUUID(),
    deviceName: hostname(),
    sharedFolders: [join(app.getPath('documents'), 'LanDrop共有')],
    downloadFolder: app.getPath('downloads'),
    accentColor: '#4caf6a',
    preferredNetworkInterface: null,
    downloadFolderOverrides: {},
    sortMode: 'name',
    viewMode: 'details'
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
  entryMetadataStore = loadEntryMetadataStore(getEntryMetadataFilePath())
  chatStore = loadChatStore(getChatFilePath())
  sortOrderStore = loadSortOrderStore(getSortOrderFilePath())
  mainWindow = createWindow('')
  registerIpcHandlers()
  await startNetworking()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow('')
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  discovery?.stop()
  void httpServer?.stop()
})
