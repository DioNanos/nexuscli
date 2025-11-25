import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 41801, // ABRAHADABRA + 1
    proxy: {
      '/api': {
        target: 'http://localhost:41800', // ABRAHADABRA - Great Work
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
