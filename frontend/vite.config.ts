import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  /** Evita que el navegador sirva un bundle viejo del login (HMR/caché). */
  server: {
    headers: { 'Cache-Control': 'no-store' },
  },
})
