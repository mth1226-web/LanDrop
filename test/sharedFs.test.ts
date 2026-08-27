import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  resolveSafePath,
  listDirectory,
  createFolder,
  renameEntry,
  isValidEntryName,
  computeFolderLabels,
  listSharedRoots,
  resolveSharedEntry,
  browseShared,
  copyEntry,
  moveEntry
} from '../src/main/sharedFs'

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'landrop-sharedfs-'))
}

test('resolveSafePathはroot直下のパスを解決できる', () => {
  const root = makeRoot()
  assert.equal(resolveSafePath(root, ''), path.resolve(root))
  assert.equal(resolveSafePath(root, 'a/b'), path.resolve(root, 'a', 'b'))
})

test('resolveSafePathは..によるroot脱出を拒否する', () => {
  const root = makeRoot()
  assert.equal(resolveSafePath(root, '../outside'), null)
  assert.equal(resolveSafePath(root, '../../etc/passwd'), null)
  assert.equal(resolveSafePath(root, 'a/../../outside'), null)
})

test('listDirectoryはフォルダを先頭にして名前順で返す', () => {
  const root = makeRoot()
  fs.writeFileSync(path.join(root, 'b.txt'), 'hello')
  fs.writeFileSync(path.join(root, 'a.txt'), 'world')
  fs.mkdirSync(path.join(root, 'zzz-folder'))

  const entries = listDirectory(root, '')
  assert.deepEqual(
    entries.map((e) => [e.name, e.isDirectory]),
    [
      ['zzz-folder', true],
      ['a.txt', false],
      ['b.txt', false]
    ]
  )
  assert.equal(entries.find((e) => e.name === 'b.txt')?.size, 5)
})

test('listDirectoryは不正なパスに対して例外を投げる', () => {
  const root = makeRoot()
  assert.throws(() => listDirectory(root, '../outside'))
})

test('createFolderでサブフォルダを作成できる', () => {
  const root = makeRoot()
  createFolder(root, '', 'new-folder')
  assert.equal(fs.existsSync(path.join(root, 'new-folder')), true)
})

test('createFolderは既存名を拒否する', () => {
  const root = makeRoot()
  createFolder(root, '', 'dup')
  assert.throws(() => createFolder(root, '', 'dup'))
})

test('createFolderは不正な名前を拒否する', () => {
  const root = makeRoot()
  assert.throws(() => createFolder(root, '', 'a/b'))
  assert.throws(() => createFolder(root, '', '..'))
  assert.throws(() => createFolder(root, '', ''))
})

test('renameEntryでファイル名を変更できる', () => {
  const root = makeRoot()
  fs.writeFileSync(path.join(root, 'old.txt'), 'x')
  renameEntry(root, '', 'old.txt', 'new.txt')
  assert.equal(fs.existsSync(path.join(root, 'old.txt')), false)
  assert.equal(fs.existsSync(path.join(root, 'new.txt')), true)
})

test('renameEntryは変更先が既に存在する場合は拒否する', () => {
  const root = makeRoot()
  fs.writeFileSync(path.join(root, 'a.txt'), 'x')
  fs.writeFileSync(path.join(root, 'b.txt'), 'y')
  assert.throws(() => renameEntry(root, '', 'a.txt', 'b.txt'))
})

test('isValidEntryNameは記号や..を拒否する', () => {
  assert.equal(isValidEntryName('normal-name'), true)
  assert.equal(isValidEntryName(''), false)
  assert.equal(isValidEntryName('  '), false)
  assert.equal(isValidEntryName('..'), false)
  assert.equal(isValidEntryName('a/b'), false)
  assert.equal(isValidEntryName('a:b'), false)
})

test('computeFolderLabelsは同名basenameに連番を振って重複を避ける', () => {
  const labels = computeFolderLabels(['C:/a/Videos', 'D:/b/Videos', 'C:/a/Docs'])
  assert.deepEqual(
    labels.map((l) => l.label),
    ['Videos', 'Videos (2)', 'Docs']
  )
})

test('listSharedRootsは共有フォルダを仮想フォルダとして名前順で返す', () => {
  const rootA = makeRoot()
  const rootB = makeRoot()
  const entries = listSharedRoots([rootB, rootA])
  assert.deepEqual(
    entries.map((e) => e.isDirectory),
    [true, true]
  )
  assert.deepEqual(
    entries.map((e) => e.name).sort(),
    [path.basename(rootA), path.basename(rootB)].sort()
  )
})

test('resolveSharedEntryはラベルを実パスに解決する', () => {
  const rootA = makeRoot()
  const rootB = makeRoot()
  const resolved = resolveSharedEntry([rootA, rootB], `${path.basename(rootB)}/sub/file.txt`)
  assert.equal(resolved?.rootPath, rootB)
  assert.equal(resolved?.innerRelPath, 'sub/file.txt')
})

test('resolveSharedEntryは空pathや未知のラベルに対してnullを返す', () => {
  const rootA = makeRoot()
  assert.equal(resolveSharedEntry([rootA], ''), null)
  assert.equal(resolveSharedEntry([rootA], '存在しないラベル/x'), null)
})

test('browseSharedはrelPathが空ならルート一覧、それ以外は中身を返す', () => {
  const rootA = makeRoot()
  fs.writeFileSync(path.join(rootA, 'hello.txt'), 'hi')

  const rootEntries = browseShared([rootA], '')
  assert.deepEqual(rootEntries.map((e) => e.name), [path.basename(rootA)])

  const innerEntries = browseShared([rootA], path.basename(rootA))
  assert.deepEqual(innerEntries.map((e) => e.name), ['hello.txt'])
})

test('browseSharedは未知のラベルに対して例外を投げる', () => {
  assert.throws(() => browseShared([], '存在しない'))
})

test('copyEntryは別フォルダへファイルをコピーし、元も残る', () => {
  const root = makeRoot()
  fs.mkdirSync(path.join(root, 'dest'))
  fs.writeFileSync(path.join(root, 'a.txt'), 'hello')

  const finalName = copyEntry(root, '', 'a.txt', root, 'dest')
  assert.equal(finalName, 'a.txt')
  assert.equal(fs.existsSync(path.join(root, 'a.txt')), true)
  assert.equal(fs.readFileSync(path.join(root, 'dest', 'a.txt'), 'utf-8'), 'hello')
})

test('copyEntryは同名衝突時に連番を振る', () => {
  const root = makeRoot()
  fs.mkdirSync(path.join(root, 'dest'))
  fs.writeFileSync(path.join(root, 'a.txt'), 'new')
  fs.writeFileSync(path.join(root, 'dest', 'a.txt'), 'existing')

  const finalName = copyEntry(root, '', 'a.txt', root, 'dest')
  assert.equal(finalName, 'a (1).txt')
  assert.equal(fs.readFileSync(path.join(root, 'dest', 'a.txt'), 'utf-8'), 'existing')
  assert.equal(fs.readFileSync(path.join(root, 'dest', 'a (1).txt'), 'utf-8'), 'new')
})

test('copyEntryはフォルダ自身の中へのコピーを拒否する', () => {
  const root = makeRoot()
  fs.mkdirSync(path.join(root, 'folder', 'sub'), { recursive: true })
  assert.throws(() => copyEntry(root, '', 'folder', root, 'folder/sub'))
})

test('copyEntryは別の共有ルート間でもコピーできる', () => {
  const rootA = makeRoot()
  const rootB = makeRoot()
  fs.writeFileSync(path.join(rootA, 'a.txt'), 'cross-root')

  copyEntry(rootA, '', 'a.txt', rootB, '')
  assert.equal(fs.readFileSync(path.join(rootB, 'a.txt'), 'utf-8'), 'cross-root')
})

test('moveEntryはコピー後に元を削除する', () => {
  const root = makeRoot()
  fs.mkdirSync(path.join(root, 'dest'))
  fs.writeFileSync(path.join(root, 'a.txt'), 'move-me')

  const finalName = moveEntry(root, '', 'a.txt', root, 'dest')
  assert.equal(finalName, 'a.txt')
  assert.equal(fs.existsSync(path.join(root, 'a.txt')), false)
  assert.equal(fs.readFileSync(path.join(root, 'dest', 'a.txt'), 'utf-8'), 'move-me')
})
