import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Satu-satunya tempat menetapkan base path aplikasi (contoh: "/" atau "/fms/").
// Semua kod lain baca dari import.meta.env.BASE_URL.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': env.VITE_API_PROXY || 'http://localhost:5080',
      },
    },
    build: {
      // Output terus ke wwwroot backend supaya satu deploy sahaja
      outDir: '../backend/Fms.Api/wwwroot',
      emptyOutDir: true,
    },
  }
})
