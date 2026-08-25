import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isNewerVersion, normalizeVersion } from '../src/main/versionCompare'

test('normalizeVersionは先頭のvを取り除く', () => {
  assert.equal(normalizeVersion('v1.2.3'), '1.2.3')
  assert.equal(normalizeVersion('1.2.3'), '1.2.3')
  assert.equal(normalizeVersion('V1.2.3'), '1.2.3')
})

test('パッチバージョンが新しければtrue', () => {
  assert.equal(isNewerVersion('0.1.0', '0.1.1'), true)
})

test('マイナーバージョンが新しければtrue', () => {
  assert.equal(isNewerVersion('0.1.9', '0.2.0'), true)
})

test('メジャーバージョンが新しければtrue', () => {
  assert.equal(isNewerVersion('0.9.9', '1.0.0'), true)
})

test('同じバージョンならfalse', () => {
  assert.equal(isNewerVersion('1.2.3', '1.2.3'), false)
})

test('latestの方が古ければfalse', () => {
  assert.equal(isNewerVersion('1.2.3', '1.2.2'), false)
})

test('v接頭辞が混在していても正しく比較できる', () => {
  assert.equal(isNewerVersion('0.1.0', 'v0.2.0'), true)
  assert.equal(isNewerVersion('v0.2.0', '0.1.0'), false)
})

test('桁数が異なっても正しく比較できる(1.0 vs 1.0.1)', () => {
  assert.equal(isNewerVersion('1.0', '1.0.1'), true)
  assert.equal(isNewerVersion('1.0.0', '1.0'), false)
})
