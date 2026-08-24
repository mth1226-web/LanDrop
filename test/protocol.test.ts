import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeDiscoveryMessage, parseDiscoveryMessage } from '../src/main/protocol'

test('announceメッセージをシリアライズ/パースできる', () => {
  const buf = serializeDiscoveryMessage({
    type: 'announce',
    deviceId: 'abc-123',
    deviceName: 'my-pc',
    httpPort: 54321
  })
  const parsed = parseDiscoveryMessage(buf)
  assert.deepEqual(parsed, {
    type: 'announce',
    deviceId: 'abc-123',
    deviceName: 'my-pc',
    httpPort: 54321
  })
})

test('goodbyeメッセージをシリアライズ/パースできる', () => {
  const buf = serializeDiscoveryMessage({ type: 'goodbye', deviceId: 'abc-123' })
  const parsed = parseDiscoveryMessage(buf)
  assert.deepEqual(parsed, { type: 'goodbye', deviceId: 'abc-123' })
})

test('壊れたJSONはnullを返す', () => {
  assert.equal(parseDiscoveryMessage(Buffer.from('not json')), null)
})

test('typeフィールドが不正な場合はnullを返す', () => {
  assert.equal(parseDiscoveryMessage(Buffer.from(JSON.stringify({ type: 'unknown' }))), null)
})

test('httpPortが範囲外の場合はnullを返す', () => {
  const bad = JSON.stringify({ type: 'announce', deviceId: 'x', deviceName: 'y', httpPort: 70000 })
  assert.equal(parseDiscoveryMessage(Buffer.from(bad)), null)
})

test('必須フィールドが欠けている場合はnullを返す', () => {
  const bad = JSON.stringify({ type: 'announce', deviceId: 'x' })
  assert.equal(parseDiscoveryMessage(Buffer.from(bad)), null)
})

test('他人が送ってきた無関係なJSONはnullを返す', () => {
  assert.equal(parseDiscoveryMessage(Buffer.from(JSON.stringify({ foo: 'bar' }))), null)
})
