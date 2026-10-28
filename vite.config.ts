import react from '@vitejs/plugin-react'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Project Pages site:
// https://minoru1017.github.io/Piano-Learning-Platform-for-Pleasure/
// Repo: Minoru1017/Piano-Learning-Platform-for-Pleasure
//
// Vite app lives under src/ so the repo-root index.html + assets/ can be the
// production build that legacy GitHub Pages (branch main, folder /) serves.
const base = '/Piano-Learning-Platform-for-Pleasure/'

// https://vite.dev/config/
export default defineConfig({
  root: 'src',
  publicDir: resolve(__dirname, 'public'),
  base,
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
  },
  optimizeDeps: {
    include: ['@tensorflow/tfjs', '@tensorflow/tfjs-backend-wasm', '@spotify/basic-pitch'],
  },
  server: {
    fs: {
      allow: [resolve(__dirname)],
    },
  },
})
