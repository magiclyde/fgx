import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: Number(process.env.VITE_PORT || 5173),
    host: true,
    proxy: {
      // 后端地址可用 VITE_API_TARGET 覆盖（后端 PORT 改了这里也要跟上）
      '/api': process.env.VITE_API_TARGET || 'http://localhost:3100',
    },
  },
})
