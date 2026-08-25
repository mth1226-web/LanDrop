import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    // extract-zip/archiver(と依存先パッケージ)は配布物にnode_modulesを同梱したくないのでバンドルする
    plugins: [externalizeDepsPlugin({ exclude: ['extract-zip', 'archiver'] })]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
