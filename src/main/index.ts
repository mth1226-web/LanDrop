import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import { existsSync, statSync } from 'fs'
import { randomUUID } from 'crypto'
import { hostname } from 'os'
import { Discovery } from './discovery'
import { HttpServer } from './httpServer'
import { TransferStore } from './transferStore'
import { sendOffer, sendOfferResponse, sendFile } from './transferClient'
import { loadSettings, saveSettings } from './settings'
import type { AppSettings, FileMeta, TransferOfferDecision, TransferSession } from '../shared/types'

const OFFER_TIMEOUT_MS = 60_000

let mainWindow: BrowserWindow | null = null
let settings: AppSettings
let httpServer: HttpServer | null = null
let discovery: Discovery | null = null
let ownHttpPort = 0

const transferStore = new TransferStore()

interface PendingIncomingOffer {
  fromAddress: string
  fromHttpPort: number
}
const pendingIncomingOffers = new Map<string, PendingIncomingOffer>()

interface PendingOutgoingFile {
  fileId: string
  filePath: string
  size: number
}
interface PendingOutgoingTransfer {
  peerAddress: string
  peerHttpPort: number
  files: PendingOutgoingFile[]
}
const pendingOutgoingTransfers = new Map<string, PendingOutgoingTransfer>()

const offerTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

function getSettingsFilePath(): string {
  return join(app.getPath('userData'), 'landrop-settings.json')
}

function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args)
}

function broadcastSession(session: TransferSession | undefined): void {
  if (session) sendToRenderer('transfer-session-updated', session)
}

function clearOfferTimeout(transferId: string): void {
  const timer = offerTimeouts.get(transferId)
  if (timer) {
    clearTimeout(timer)
    offerTimeouts.delete(transferId)
  }
}

function armOfferTimeout(transferId: string): void {
  const timer = setTimeout(() => {
    offerTimeouts.delete(transferId)
    if (transferStore.transition(transferId, 'timeout')) {
      broadcastSession(transferStore.get(transferId))
    }
  }, OFFER_TIMEOUT_MS)
  offerTimeouts.set(transferId, timer)
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 960,
    height: 700,
    minWidth: 720,
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

async function startNetworking(): Promise<void> {
  httpServer = new HttpServer({ transferStore, getSaveFolder: () => settings.saveFolder })
  ownHttpPort = await httpServer.start(0)

  discovery = new Discovery({
    deviceId: settings.deviceId,
    deviceName: settings.deviceName,
    getHttpPort: () => ownHttpPort
  })

  httpServer.on('offer', ({ session, fromAddress, fromHttpPort }) => {
    pendingIncomingOffers.set(session.transferId, { fromAddress, fromHttpPort })
    armOfferTimeout(session.transferId)
    broadcastSession(session)
  })

  httpServer.on('offer-response', (session) => {
    clearOfferTimeout(session.transferId)
    broadcastSession(session)
    if (session.status === 'accepted') void startSendingFiles(session.transferId)
    else pendingOutgoingTransfers.delete(session.transferId)
  })

  httpServer.on('transfer-progress', (session) => broadcastSession(session))
  httpServer.on('transfer-completed', (session) => {
    pendingIncomingOffers.delete(session.transferId)
    broadcastSession(session)
  })
  httpServer.on('transfer-failed', (session) => {
    pendingIncomingOffers.delete(session.transferId)
    broadcastSession(session)
  })

  discovery.on('peers-changed', (peers) => sendToRenderer('peers-changed', peers))

  discovery.start()
}

async function startSendingFiles(transferId: string): Promise<void> {
  const pending = pendingOutgoingTransfers.get(transferId)
  if (!pending) return

  transferStore.transition(transferId, 'in_progress')
  broadcastSession(transferStore.get(transferId))

  try {
    for (const file of pending.files) {
      await sendFile({
        address: pending.peerAddress,
        port: pending.peerHttpPort,
        transferId,
        fileId: file.fileId,
        filePath: file.filePath,
        size: file.size,
        onProgress: (transferredBytes) => {
          transferStore.updateProgress(transferId, file.fileId, transferredBytes)
          broadcastSession(transferStore.get(transferId))
        }
      })
    }
    transferStore.transition(transferId, 'completed')
  } catch (err) {
    transferStore.transition(transferId, 'failed', String(err))
  } finally {
    pendingOutgoingTransfers.delete(transferId)
    broadcastSession(transferStore.get(transferId))
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('get-peers', () => discovery?.getPeers() ?? [])

  ipcMain.handle('get-settings', () => settings)

  ipcMain.handle('set-settings', (_event, patch: { deviceName: string; saveFolder: string }) => {
    settings = { ...settings, deviceName: patch.deviceName, saveFolder: patch.saveFolder }
    saveSettings(getSettingsFilePath(), settings)
    discovery?.setDeviceName(settings.deviceName)
    return settings
  })

  ipcMain.handle('choose-save-folder', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('open-save-folder', () => {
    void shell.openPath(settings.saveFolder)
  })

  ipcMain.handle('send-files', async (_event, args: { peerDeviceId: string; filePaths: string[] }) => {
    const peer = discovery?.getPeers().find((p) => p.deviceId === args.peerDeviceId)
    if (!peer) return { ok: false, error: 'peer-not-found' }
    if (!httpServer) return { ok: false, error: 'not-ready' }

    const transferId = randomUUID()
    const files: FileMeta[] = []
    const outgoingFiles: PendingOutgoingFile[] = []
    for (const filePath of args.filePaths) {
      const stat = statSync(filePath)
      const fileId = randomUUID()
      const name = filePath.split(/[\\/]/).pop() ?? filePath
      files.push({ fileId, name, size: stat.size, mimeType: 'application/octet-stream' })
      outgoingFiles.push({ fileId, filePath, size: stat.size })
    }

    transferStore.create({
      transferId,
      direction: 'outgoing',
      peerDeviceId: peer.deviceId,
      peerDeviceName: peer.deviceName,
      files,
      now: Date.now()
    })
    pendingOutgoingTransfers.set(transferId, {
      peerAddress: peer.address,
      peerHttpPort: peer.httpPort,
      files: outgoingFiles
    })
    armOfferTimeout(transferId)
    broadcastSession(transferStore.get(transferId))

    try {
      await sendOffer(peer.address, peer.httpPort, {
        transferId,
        fromDeviceId: settings.deviceId,
        fromDeviceName: settings.deviceName,
        fromHttpPort: ownHttpPort,
        files
      })
    } catch (err) {
      clearOfferTimeout(transferId)
      pendingOutgoingTransfers.delete(transferId)
      transferStore.transition(transferId, 'failed', String(err))
      broadcastSession(transferStore.get(transferId))
      return { ok: false, error: String(err) }
    }

    return { ok: true }
  })

  ipcMain.handle('respond-to-offer', async (_event, args: { transferId: string; decision: TransferOfferDecision }) => {
    clearOfferTimeout(args.transferId)
    const nextStatus = args.decision === 'accepted' ? 'accepted' : 'rejected'
    transferStore.transition(args.transferId, nextStatus)
    broadcastSession(transferStore.get(args.transferId))

    const origin = pendingIncomingOffers.get(args.transferId)
    pendingIncomingOffers.delete(args.transferId)
    if (!origin) return

    try {
      await sendOfferResponse(origin.fromAddress, origin.fromHttpPort, {
        transferId: args.transferId,
        decision: args.decision
      })
    } catch {
      // 送信側が既に終了しているなどで応答が届かない場合は諦める（送信側は自身のタイムアウトで処理する）
    }
  })
}

function loadOrInitSettings(): AppSettings {
  const filePath = getSettingsFilePath()
  const isFirstRun = !existsSync(filePath)
  const defaults: AppSettings = {
    deviceId: randomUUID(),
    deviceName: hostname(),
    saveFolder: app.getPath('downloads')
  }
  const loaded = loadSettings(filePath, defaults)
  if (isFirstRun) saveSettings(filePath, loaded)
  return loaded
}

app.whenReady().then(async () => {
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
