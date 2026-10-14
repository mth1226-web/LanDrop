import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { scanForDuplicates } from '../src/main/duplicateFinder'

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'landrop-dupfinder-'))
}

function noop(): void {}

test('内容が完全一致する2つのファイルを重複として検出する', async () => {
  const root = makeRoot()
  fs.writeFileSync(path.join(root, 'a.txt'), 'hello world')
  fs.writeFileSync(path.join(root, 'b.txt'), 'hello world')

  const result = await scanForDuplicates([root], noop, () => false)

  assert.equal(result.fileGroups.length, 1)
  assert.equal(result.fileGroups[0].paths.length, 2)
  assert.deepEqual(
    result.fileGroups[0].paths.map((p) => path.basename(p)).sort(),
    ['a.txt', 'b.txt']
  )
  assert.equal(result.folderGroups.length, 0)
})

test('サイズが同じでも内容が異なるファイルは重複と判定しない', async () => {
  const root = makeRoot()
  fs.writeFileSync(path.join(root, 'a.txt'), 'aaaaaaaaaa')
  fs.writeFileSync(path.join(root, 'b.txt'), 'bbbbbbbbbb')

  const result = await scanForDuplicates([root], noop, () => false)

  assert.equal(result.fileGroups.length, 0)
})

test('サイズがユニークなファイルはハッシュ計算の対象にならず重複にもならない', async () => {
  const root = makeRoot()
  fs.writeFileSync(path.join(root, 'unique.txt'), 'x')

  const result = await scanForDuplicates([root], noop, () => false)

  assert.equal(result.fileGroups.length, 0)
  assert.equal(result.folderGroups.length, 0)
})

test('中身が完全一致する2つのフォルダを重複として検出し、配下のファイルは個別に重複表示しない', async () => {
  const root = makeRoot()
  fs.mkdirSync(path.join(root, 'folderA', 'nested'), { recursive: true })
  fs.mkdirSync(path.join(root, 'folderB', 'nested'), { recursive: true })
  fs.writeFileSync(path.join(root, 'folderA', 'x.txt'), 'content-x')
  fs.writeFileSync(path.join(root, 'folderB', 'x.txt'), 'content-x')
  fs.writeFileSync(path.join(root, 'folderA', 'nested', 'y.txt'), 'content-y')
  fs.writeFileSync(path.join(root, 'folderB', 'nested', 'y.txt'), 'content-y')

  const result = await scanForDuplicates([root], noop, () => false)

  assert.equal(result.folderGroups.length, 1)
  assert.equal(result.folderGroups[0].fileCount, 2)
  assert.deepEqual(
    result.folderGroups[0].paths.map((p) => path.basename(p)).sort(),
    ['folderA', 'folderB']
  )
  // folderA/folderBのネストしたサブフォルダ(nested)は親が既に重複判定されているので別枠で出さない
  // また配下のx.txt/y.txtもファイル単位の重複としては出さない(フォルダ単位で既に報告済みのため)
  assert.equal(result.fileGroups.length, 0)
  // フォルダ自体が完全一致している場合、その1つ上(root)は比較対象にならないため似ているフォルダにも出ない
  assert.equal(result.similarFolderPairs.length, 0)
})

test('完全一致ではないが一部が共通するフォルダを「似ているフォルダ」として検出する', async () => {
  const root = makeRoot()
  fs.mkdirSync(path.join(root, 'projectA', 'assets'), { recursive: true })
  fs.mkdirSync(path.join(root, 'projectB', 'assets'), { recursive: true })
  // assets配下は両方とも完全一致(重複フォルダとして検出される葉)
  fs.writeFileSync(path.join(root, 'projectA', 'assets', 'logo.png'), 'same-logo-content')
  fs.writeFileSync(path.join(root, 'projectB', 'assets', 'logo.png'), 'same-logo-content')
  // 親(projectA/projectB)にはそれぞれ固有のファイルもある(完全一致ではない)
  fs.writeFileSync(path.join(root, 'projectA', 'readme.txt'), 'readme-A-unique-content')
  fs.writeFileSync(path.join(root, 'projectB', 'notes.txt'), 'notes-B-different')

  const result = await scanForDuplicates([root], noop, () => false)

  assert.equal(result.folderGroups.length, 1)
  assert.deepEqual(
    result.folderGroups[0].paths.map((p) => path.basename(p)).sort(),
    ['assets', 'assets']
  )

  assert.equal(result.similarFolderPairs.length, 1)
  const pair = result.similarFolderPairs[0]
  assert.deepEqual([path.basename(pair.pathA), path.basename(pair.pathB)].sort(), ['projectA', 'projectB'])
  assert.equal(pair.matchedFileCount, 1)
  assert.equal(pair.totalFileCountA, 2)
  assert.equal(pair.totalFileCountB, 2)
  assert.equal(pair.similarityPercent, 50)
})

test('共通点が全く無いフォルダ同士は「似ているフォルダ」に出さない', async () => {
  const root = makeRoot()
  fs.mkdirSync(path.join(root, 'projectA', 'assets'), { recursive: true })
  fs.mkdirSync(path.join(root, 'projectB', 'assets'), { recursive: true })
  fs.writeFileSync(path.join(root, 'projectA', 'assets', 'logo.png'), 'same-logo-content')
  fs.writeFileSync(path.join(root, 'projectB', 'assets', 'logo.png'), 'same-logo-content')
  // 親側は完全に無関係な内容(サイズも被らないようにする)
  fs.writeFileSync(path.join(root, 'projectA', 'a1.txt'), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
  fs.writeFileSync(path.join(root, 'projectA', 'a2.txt'), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab')
  fs.writeFileSync(path.join(root, 'projectA', 'a3.txt'), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaac')
  fs.writeFileSync(path.join(root, 'projectB', 'b1.txt'), 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')

  const result = await scanForDuplicates([root], noop, () => false)

  assert.equal(result.folderGroups.length, 1)
  // projectAには固有ファイルが3件、projectBには1件あり、一致は1件(logo.png)だけなので
  // 一致率は 1/max(4,2)=25% となり閾値(50%)未満のため出ない
  assert.equal(result.similarFolderPairs.length, 0)
})

test('フォルダの中身が一部でも異なれば重複フォルダとして検出しない', async () => {
  const root = makeRoot()
  fs.mkdirSync(path.join(root, 'folderA'))
  fs.mkdirSync(path.join(root, 'folderB'))
  fs.writeFileSync(path.join(root, 'folderA', 'x.txt'), 'content-x')
  fs.writeFileSync(path.join(root, 'folderB', 'x.txt'), 'content-x')
  fs.writeFileSync(path.join(root, 'folderA', 'only-in-a.txt'), 'unique-a')

  const result = await scanForDuplicates([root], noop, () => false)

  assert.equal(result.folderGroups.length, 0)
  // x.txt自体はサイズ+内容が一致するのでファイル単位では重複として残る
  assert.equal(result.fileGroups.length, 1)
})

test('キャンセルすると空の結果とcancelled:trueを返す', async () => {
  const root = makeRoot()
  fs.writeFileSync(path.join(root, 'a.txt'), 'hello world')
  fs.writeFileSync(path.join(root, 'b.txt'), 'hello world')

  const result = await scanForDuplicates([root], noop, () => true)

  assert.equal(result.cancelled, true)
  assert.equal(result.fileGroups.length, 0)
  assert.equal(result.folderGroups.length, 0)
})

test('複数のルート(別ドライブ相当)をまたいで内容が一致するファイルを検出する', async () => {
  const rootA = makeRoot()
  const rootB = makeRoot()
  fs.writeFileSync(path.join(rootA, 'a.txt'), 'cross-root content')
  fs.writeFileSync(path.join(rootB, 'b.txt'), 'cross-root content')

  const result = await scanForDuplicates([rootA, rootB], noop, () => false)

  assert.equal(result.fileGroups.length, 1)
  assert.deepEqual(
    result.fileGroups[0].paths.map((p) => path.basename(p)).sort(),
    ['a.txt', 'b.txt']
  )
})

test('複数のルートをまたいで中身が完全一致するフォルダを検出する', async () => {
  const rootA = makeRoot()
  const rootB = makeRoot()
  fs.mkdirSync(path.join(rootA, 'assets'))
  fs.mkdirSync(path.join(rootB, 'assets'))
  fs.writeFileSync(path.join(rootA, 'assets', 'logo.png'), 'same-logo-content')
  fs.writeFileSync(path.join(rootB, 'assets', 'logo.png'), 'same-logo-content')
  // ルート直下にも固有のファイルを置き、ルート同士は完全一致しない(assetsフォルダだけが一致する)ようにする
  fs.writeFileSync(path.join(rootA, 'readme-a.txt'), 'root-a-only')
  fs.writeFileSync(path.join(rootB, 'readme-b.txt'), 'root-b-only')

  const result = await scanForDuplicates([rootA, rootB], noop, () => false)

  assert.equal(result.folderGroups.length, 1)
  assert.deepEqual(
    result.folderGroups[0].paths.map((p) => path.dirname(p)).sort(),
    [rootA, rootB].sort()
  )
})
