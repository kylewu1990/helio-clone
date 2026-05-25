import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:5373', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:5373', changeOrigin: true },
      '/ws/terminal': { target: 'ws://127.0.0.1:5373', ws: true },
      '/ws': { target: 'ws://127.0.0.1:5373', ws: true },
    },
  },
})
