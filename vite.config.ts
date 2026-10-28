import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Project Pages site:
// https://minoru1017.github.io/Piano-Learning-Platform-for-Pleasure/
// Repo: Minoru1017/Piano-Learning-Platform-for-Pleasure
const base = '/Piano-Learning-Platform-for-Pleasure/'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base,
})
