import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadSettings, saveSettings } from '../src/main/settings'

const DEFAULTS = {
  deviceId: 'default-id',
  deviceName: 'default-name',
  sharedFolders: ['/default/shared'],
  downloadFolder: '/default/downloads',
  accentColor: '#4caf6a'
}

test('ファイルが存在しない場合はデフォルト値を返す', () => {
  const filePath = path.join(os.tmpdir(), `landrop-settings-missing-${Date.now()}.json`)
  assert.deepEqual(loadSettings(filePath, DEFAULTS), DEFAULTS)
})

test('保存した内容をそのまま読み込める', () => {
  const filePath = path.join(os.tmpdir(), `landrop-settings-${Date.now()}.json`)
  const settings = {
    deviceId: 'id-1',
    deviceName: 'My PC',
    sharedFolders: ['C:/Users/me/LanDrop共有', 'D:/Videos共有'],
    downloadFolder: 'C:/Users/me/Downloads',
    accentColor: '#ff8800'
  }
  saveSettings(filePath, settings)
  assert.deepEqual(loadSettings(filePath, DEFAULTS), settings)
  fs.rmSync(filePath, { force: true })
})

test('壊れたJSONの場合はデフォルト値にフォールバックする', () => {
  const filePath = path.join(os.tmpdir(), `landrop-settings-broken-${Date.now()}.json`)
  fs.writeFileSync(filePath, 'not json', 'utf-8')
  assert.deepEqual(loadSettings(filePath, DEFAULTS), DEFAULTS)
  fs.rmSync(filePath, { force: true })
})

test('一部フィールドが欠けている場合は該当フィールドのみデフォルトで補う', () => {
  const filePath = path.join(os.tmpdir(), `landrop-settings-partial-${Date.now()}.json`)
  fs.writeFileSync(filePath, JSON.stringify({ deviceName: 'Only Name' }), 'utf-8')
  assert.deepEqual(loadSettings(filePath, DEFAULTS), {
    deviceId: DEFAULTS.deviceId,
    deviceName: 'Only Name',
    sharedFolders: DEFAULTS.sharedFolders,
    downloadFolder: DEFAULTS.downloadFolder,
    accentColor: DEFAULTS.accentColor
  })
  fs.rmSync(filePath, { force: true })
})

test('sharedFoldersが空配列の場合はそのまま(何も共有しない状態として)尊重される', () => {
  const filePath = path.join(os.tmpdir(), `landrop-settings-empty-array-${Date.now()}.json`)
  fs.writeFileSync(filePath, JSON.stringify({ sharedFolders: [] }), 'utf-8')
  assert.deepEqual(loadSettings(filePath, DEFAULTS).sharedFolders, [])
  fs.rmSync(filePath, { force: true })
})

test('不正な形式のaccentColorはデフォルトにフォールバックする', () => {
  const filePath = path.join(os.tmpdir(), `landrop-settings-bad-color-${Date.now()}.json`)
  fs.writeFileSync(filePath, JSON.stringify({ accentColor: 'not-a-color' }), 'utf-8')
  assert.equal(loadSettings(filePath, DEFAULTS).accentColor, DEFAULTS.accentColor)
  fs.rmSync(filePath, { force: true })
})
