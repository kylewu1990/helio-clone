import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// API target 可通过 API_TARGET 环境变量切换(默认 5373);
// 多 worktree 并行开发时用 PORT=5473 启 server + API_TARGET=http://127.0.0.1:5473 启 web。
const API_HTTP = process.env.API_TARGET || 'http://127.0.0.1:5373'
const API_WS = API_HTTP.replace(/^http(s?)/, 'ws$1')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.WEB_PORT || 5173),
    proxy: {
      '/api': { target: API_HTTP, changeOrigin: true },
      '/uploads': { target: API_HTTP, changeOrigin: true },
      '/ws/terminal': { target: API_WS, ws: true },
      '/ws': { target: API_WS, ws: true },
    },
  },
})
