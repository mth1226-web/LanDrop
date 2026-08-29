import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    // extract-zip/archiver/bplist-*(と依存先パッケージ)は配布物にnode_modulesを同梱したくないのでバンドルする
    plugins: [externalizeDepsPlugin({ exclude: ['extract-zip', 'archiver', 'bplist-parser', 'bplist-creator'] })]
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
