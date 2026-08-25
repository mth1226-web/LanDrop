import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderWebUiHtml } from '../src/main/webUi'

test('deviceNameを含んだHTML文書を返す', () => {
  const html = renderWebUiHtml('MSI')
  assert.match(html, /<!DOCTYPE html>/)
  assert.match(html, /MSI/)
  assert.match(html, /\/api\/browse/)
  assert.match(html, /\/api\/upload/)
  assert.match(html, /\/api\/download/)
})

test('deviceNameのHTML特殊文字をエスケープする', () => {
  const html = renderWebUiHtml('<script>alert(1)</script>')
  assert.equal(html.includes('<script>alert(1)</script>'), false)
  assert.match(html, /&lt;script&gt;/)
})
