import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  root: 'renderer',
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: ['localhost', '127.0.0.1', '.ngrok-free.dev']
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
})
