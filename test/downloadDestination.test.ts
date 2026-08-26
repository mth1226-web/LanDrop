import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveDownloadDestination } from '../src/main/downloadDestination'

test('relPathがある場合、その先頭セグメント(トップレベルラベル)の設定を使う', () => {
  const overrides = { Videos: 'D:/Videos', Docs: 'D:/Docs' }
  assert.equal(resolveDownloadDestination('Videos/sub', ['a.mp4'], overrides, 'C:/Downloads'), 'D:/Videos')
})

test('該当ラベルの個別設定が無ければfallbackを使う', () => {
  const overrides = { Videos: 'D:/Videos' }
  assert.equal(resolveDownloadDestination('Docs/sub', ['a.pdf'], overrides, 'C:/Downloads'), 'C:/Downloads')
})

test('ルート直下(relPathが空)で1件だけの選択ならそのフォルダ名で個別設定を引く', () => {
  const overrides = { Videos: 'D:/Videos' }
  assert.equal(resolveDownloadDestination('', ['Videos'], overrides, 'C:/Downloads'), 'D:/Videos')
})

test('ルート直下で複数選択した場合はfallbackを使う(混在は分割できないため)', () => {
  const overrides = { Videos: 'D:/Videos', Docs: 'D:/Docs' }
  assert.equal(resolveDownloadDestination('', ['Videos', 'Docs'], overrides, 'C:/Downloads'), 'C:/Downloads')
})

test('overridesが空でも常にfallbackへ安全にフォールバックする', () => {
  assert.equal(resolveDownloadDestination('Videos', ['a.mp4'], {}, 'C:/Downloads'), 'C:/Downloads')
})
