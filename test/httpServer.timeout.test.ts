import { test } from 'node:test'
import assert from 'node:assert/strict'
import type http from 'node:http'
import { HttpServer } from '../src/main/httpServer'

function createServer(): HttpServer {
  return new HttpServer({
    getSharedFolders: () => [],
    getDeviceName: () => 'test',
    trashPath: async () => {}
  })
}

// Node標準のrequestTimeout(5分)が有効なままだと、大きなファイル/フォルダを送るなど転送に5分以上かかった時点で
// 受信側が408を返して送信が中断されてしまう。LAN内の大容量転送を妨げないよう無効化されていること
test('HTTPサーバーはリクエスト受信全体のタイムアウト(requestTimeout)で長時間の転送を切らない', () => {
  const inner = (createServer() as unknown as { server: http.Server }).server
  assert.equal(inner.requestTimeout, 0)
})
