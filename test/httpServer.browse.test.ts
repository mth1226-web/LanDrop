import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { HttpServer } from '../src/main/httpServer'
import { browseFolder, createFolderRemote, renameEntryRemote, uploadFile, downloadFile } from '../src/main/transferClient'

// 実httpサーバーを1台localhostに立て、共有フォルダのbrowse/upload/download/mkdir/renameを検証する

function makeServer(): { server: HttpServer; sharedFolder: string } {
  const sharedFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'landrop-shared-'))
  const server = new HttpServer({ getSharedFolder: () => sharedFolder })
  return { server, sharedFolder }
}

test('browseで共有フォルダの中身を一覧できる', async () => {
  const { server, sharedFolder } = makeServer()
  const port = await server.start(0)
  try {
    fs.writeFileSync(path.join(sharedFolder, 'hello.txt'), 'hi')
    fs.mkdirSync(path.join(sharedFolder, 'sub'))

    const entries = await browseFolder('127.0.0.1', port, '')
    assert.deepEqual(
      entries.map((e) => [e.name, e.isDirectory]),
      [
        ['sub', true],
        ['hello.txt', false]
      ]
    )
  } finally {
    await server.stop()
    fs.rmSync(sharedFolder, { recursive: true, force: true })
  }
})

test('uploadでファイルを送り込み、downloadで取得できる', async () => {
  const { server, sharedFolder } = makeServer()
  const port = await server.start(0)
  try {
    const srcPath = path.join(os.tmpdir(), `landrop-upload-src-${Date.now()}.txt`)
    fs.writeFileSync(srcPath, 'upload-content')

    const uploadReceived = once(server, 'upload-received')
    await uploadFile({
      address: '127.0.0.1',
      port,
      relPath: '',
      name: 'uploaded.txt',
      filePath: srcPath,
      size: fs.statSync(srcPath).size
    })
    const [payload] = await uploadReceived
    assert.equal(payload.fileName, 'uploaded.txt')
    assert.equal(fs.readFileSync(path.join(sharedFolder, 'uploaded.txt'), 'utf-8'), 'upload-content')

    const destPath = path.join(os.tmpdir(), `landrop-download-dest-${Date.now()}.txt`)
    await downloadFile({ address: '127.0.0.1', port, relPath: 'uploaded.txt', destPath })
    assert.equal(fs.readFileSync(destPath, 'utf-8'), 'upload-content')

    fs.rmSync(srcPath, { force: true })
    fs.rmSync(destPath, { force: true })
  } finally {
    await server.stop()
    fs.rmSync(sharedFolder, { recursive: true, force: true })
  }
})

test('同名ファイルをuploadすると衝突を避けてリネームされる', async () => {
  const { server, sharedFolder } = makeServer()
  const port = await server.start(0)
  try {
    fs.writeFileSync(path.join(sharedFolder, 'dup.txt'), 'existing')
    const srcPath = path.join(os.tmpdir(), `landrop-dup-src-${Date.now()}.txt`)
    fs.writeFileSync(srcPath, 'new-content')

    await uploadFile({
      address: '127.0.0.1',
      port,
      relPath: '',
      name: 'dup.txt',
      filePath: srcPath,
      size: fs.statSync(srcPath).size
    })

    assert.equal(fs.readFileSync(path.join(sharedFolder, 'dup.txt'), 'utf-8'), 'existing')
    assert.equal(fs.readFileSync(path.join(sharedFolder, 'dup (1).txt'), 'utf-8'), 'new-content')

    fs.rmSync(srcPath, { force: true })
  } finally {
    await server.stop()
    fs.rmSync(sharedFolder, { recursive: true, force: true })
  }
})

test('mkdirでフォルダを作成できる', async () => {
  const { server, sharedFolder } = makeServer()
  const port = await server.start(0)
  try {
    await createFolderRemote('127.0.0.1', port, '', 'new-folder')
    assert.equal(fs.existsSync(path.join(sharedFolder, 'new-folder')), true)
  } finally {
    await server.stop()
    fs.rmSync(sharedFolder, { recursive: true, force: true })
  }
})

test('renameでファイル名を変更できる', async () => {
  const { server, sharedFolder } = makeServer()
  const port = await server.start(0)
  try {
    fs.writeFileSync(path.join(sharedFolder, 'old.txt'), 'x')
    await renameEntryRemote('127.0.0.1', port, '', 'old.txt', 'renamed.txt')
    assert.equal(fs.existsSync(path.join(sharedFolder, 'old.txt')), false)
    assert.equal(fs.existsSync(path.join(sharedFolder, 'renamed.txt')), true)
  } finally {
    await server.stop()
    fs.rmSync(sharedFolder, { recursive: true, force: true })
  }
})

test('パストラバーサルを試みるdownloadは404になる', async () => {
  const { server, sharedFolder } = makeServer()
  const port = await server.start(0)
  try {
    const destPath = path.join(os.tmpdir(), `landrop-traversal-dest-${Date.now()}.txt`)
    await assert.rejects(() =>
      downloadFile({ address: '127.0.0.1', port, relPath: '../../etc/passwd', destPath })
    )
  } finally {
    await server.stop()
    fs.rmSync(sharedFolder, { recursive: true, force: true })
  }
})
