import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadSettings, saveSettings } from '../src/main/settings'

const DEFAULTS = { deviceId: 'default-id', deviceName: 'default-name', saveFolder: '/default/save' }

test('ファイルが存在しない場合はデフォルト値を返す', () => {
  const filePath = path.join(os.tmpdir(), `landrop-settings-missing-${Date.now()}.json`)
  assert.deepEqual(loadSettings(filePath, DEFAULTS), DEFAULTS)
})

test('保存した内容をそのまま読み込める', () => {
  const filePath = path.join(os.tmpdir(), `landrop-settings-${Date.now()}.json`)
  const settings = { deviceId: 'id-1', deviceName: 'My PC', saveFolder: 'C:/Users/me/Downloads' }
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
    saveFolder: DEFAULTS.saveFolder
  })
  fs.rmSync(filePath, { force: true })
})
