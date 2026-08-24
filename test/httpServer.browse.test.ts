import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { HttpServer } from '../src/main/httpServer'
import { browseFolder, createFolderRemote, renameEntryRemote, uploadFile, downloadFile } from '../src/main/transferClient'

// 実httpサーバーを1台localhostに立て、複数共有フォルダのbrowse/upload/download/mkdir/renameを検証する

function makeServer(sharedFolders: string[]): { server: HttpServer; sharedFolders: string[] } {
  const server = new HttpServer({ getSharedFolders: () => sharedFolders })
  return { server, sharedFolders }
}

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'landrop-shared-'))
}

test('relPathが空だと共有フォルダ自体が仮想フォルダとして一覧される', async () => {
  const folderA = makeTempDir()
  const folderB = makeTempDir()
  const { server } = makeServer([folderA, folderB])
  const port = await server.start(0)
  try {
    const entries = await browseFolder('127.0.0.1', port, '')
    assert.deepEqual(
      entries.map((e) => e.name).sort(),
      [path.basename(folderA), path.basename(folderB)].sort()
    )
    assert.ok(entries.every((e) => e.isDirectory))
  } finally {
    await server.stop()
    fs.rmSync(folderA, { recursive: true, force: true })
    fs.rmSync(folderB, { recursive: true, force: true })
  }
})

test('共有フォルダのラベルを指定するとその中身を一覧できる', async () => {
  const folderA = makeTempDir()
  const { server } = makeServer([folderA])
  const port = await server.start(0)
  try {
    fs.writeFileSync(path.join(folderA, 'hello.txt'), 'hi')
    fs.mkdirSync(path.join(folderA, 'sub'))

    const entries = await browseFolder('127.0.0.1', port, path.basename(folderA))
    assert.deepEqual(
      entries.map((e) => [e.name, e.isDirectory]),
      [
        ['sub', true],
        ['hello.txt', false]
      ]
    )
  } finally {
    await server.stop()
    fs.rmSync(folderA, { recursive: true, force: true })
  }
})

test('uploadでファイルを送り込み、downloadで取得できる', async () => {
  const folderA = makeTempDir()
  const { server } = makeServer([folderA])
  const port = await server.start(0)
  const label = path.basename(folderA)
  try {
    const srcPath = path.join(os.tmpdir(), `landrop-upload-src-${Date.now()}.txt`)
    fs.writeFileSync(srcPath, 'upload-content')

    const uploadReceived = once(server, 'upload-received')
    await uploadFile({
      address: '127.0.0.1',
      port,
      relPath: label,
      name: 'uploaded.txt',
      filePath: srcPath,
      size: fs.statSync(srcPath).size
    })
    const [payload] = await uploadReceived
    assert.equal(payload.fileName, 'uploaded.txt')
    assert.equal(fs.readFileSync(path.join(folderA, 'uploaded.txt'), 'utf-8'), 'upload-content')

    const destPath = path.join(os.tmpdir(), `landrop-download-dest-${Date.now()}.txt`)
    await downloadFile({ address: '127.0.0.1', port, relPath: `${label}/uploaded.txt`, destPath })
    assert.equal(fs.readFileSync(destPath, 'utf-8'), 'upload-content')

    fs.rmSync(srcPath, { force: true })
    fs.rmSync(destPath, { force: true })
  } finally {
    await server.stop()
    fs.rmSync(folderA, { recursive: true, force: true })
  }
})

test('同名ファイルをuploadすると衝突を避けてリネームされる', async () => {
  const folderA = makeTempDir()
  const { server } = makeServer([folderA])
  const port = await server.start(0)
  const label = path.basename(folderA)
  try {
    fs.writeFileSync(path.join(folderA, 'dup.txt'), 'existing')
    const srcPath = path.join(os.tmpdir(), `landrop-dup-src-${Date.now()}.txt`)
    fs.writeFileSync(srcPath, 'new-content')

    await uploadFile({
      address: '127.0.0.1',
      port,
      relPath: label,
      name: 'dup.txt',
      filePath: srcPath,
      size: fs.statSync(srcPath).size
    })

    assert.equal(fs.readFileSync(path.join(folderA, 'dup.txt'), 'utf-8'), 'existing')
    assert.equal(fs.readFileSync(path.join(folderA, 'dup (1).txt'), 'utf-8'), 'new-content')

    fs.rmSync(srcPath, { force: true })
  } finally {
    await server.stop()
    fs.rmSync(folderA, { recursive: true, force: true })
  }
})

test('mkdirでフォルダを作成できる', async () => {
  const folderA = makeTempDir()
  const { server } = makeServer([folderA])
  const port = await server.start(0)
  try {
    await createFolderRemote('127.0.0.1', port, path.basename(folderA), 'new-folder')
    assert.equal(fs.existsSync(path.join(folderA, 'new-folder')), true)
  } finally {
    await server.stop()
    fs.rmSync(folderA, { recursive: true, force: true })
  }
})

test('renameでファイル名を変更できる', async () => {
  const folderA = makeTempDir()
  const { server } = makeServer([folderA])
  const port = await server.start(0)
  try {
    fs.writeFileSync(path.join(folderA, 'old.txt'), 'x')
    await renameEntryRemote('127.0.0.1', port, path.basename(folderA), 'old.txt', 'renamed.txt')
    assert.equal(fs.existsSync(path.join(folderA, 'old.txt')), false)
    assert.equal(fs.existsSync(path.join(folderA, 'renamed.txt')), true)
  } finally {
    await server.stop()
    fs.rmSync(folderA, { recursive: true, force: true })
  }
})

test('未知の共有フォルダラベルを指定したdownloadは404になる', async () => {
  const folderA = makeTempDir()
  const { server } = makeServer([folderA])
  const port = await server.start(0)
  try {
    const destPath = path.join(os.tmpdir(), `landrop-traversal-dest-${Date.now()}.txt`)
    await assert.rejects(() =>
      downloadFile({ address: '127.0.0.1', port, relPath: '存在しない共有フォルダ/x.txt', destPath })
    )
  } finally {
    await server.stop()
    fs.rmSync(folderA, { recursive: true, force: true })
  }
})

test('パストラバーサルを試みるdownloadは404になる', async () => {
  const folderA = makeTempDir()
  const { server } = makeServer([folderA])
  const port = await server.start(0)
  try {
    const destPath = path.join(os.tmpdir(), `landrop-traversal-dest2-${Date.now()}.txt`)
    await assert.rejects(() =>
      downloadFile({
        address: '127.0.0.1',
        port,
        relPath: `${path.basename(folderA)}/../../../etc/passwd`,
        destPath
      })
    )
  } finally {
    await server.stop()
    fs.rmSync(folderA, { recursive: true, force: true })
  }
})
