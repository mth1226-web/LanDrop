import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readFinderTagColor, writeFinderTagColor } from '../src/main/finderTags'

// このテストはWindows/Linux上で実行される想定(process.platform !== 'darwin')。
// xattrコマンドを実際に読み書きするMac固有の挙動は、実機での確認が別途必要。

test('Mac以外ではreadFinderTagColorは常にnullを返す', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'landrop-findertags-')), 'a.txt')
  fs.writeFileSync(file, 'hello')
  assert.equal(readFinderTagColor(file), null)
})

test('Mac以外ではwriteFinderTagColorは例外を投げる', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'landrop-findertags-')), 'a.txt')
  fs.writeFileSync(file, 'hello')
  assert.throws(() => writeFinderTagColor(file, '#8E8E93'))
})
