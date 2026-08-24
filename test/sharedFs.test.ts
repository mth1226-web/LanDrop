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
  isValidEntryName
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
