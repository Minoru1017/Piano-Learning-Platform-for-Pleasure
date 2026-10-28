/**
 * Copy Vite `dist/` → repo root so GitHub Pages (legacy: branch main, folder /)
 * serves the production build instead of the Vite source entry.
 */
import { cpSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const dist = join(root, 'dist')
const rootIndex = join(root, 'index.html')
const rootAssets = join(root, 'assets')
const rootFavicon = join(root, 'favicon.svg')
const rootNojekyll = join(root, '.nojekyll')

if (!existsSync(dist)) {
  console.error('dist/ missing — run npm run build first')
  process.exit(1)
}

const html = readFileSync(join(dist, 'index.html'), 'utf8')
if (html.includes('/src/main.tsx') || html.includes('src="/main.tsx"')) {
  console.error('dist/index.html still looks like Vite source — refusing to sync')
  process.exit(1)
}
if (!html.includes('/Piano-Learning-Platform-for-Pleasure/assets/')) {
  console.error('dist/index.html missing Pages base asset paths')
  process.exit(1)
}

rmSync(rootAssets, { recursive: true, force: true })
mkdirSync(rootAssets, { recursive: true })
cpSync(join(dist, 'assets'), rootAssets, { recursive: true })
cpSync(join(dist, 'index.html'), rootIndex)
if (existsSync(join(dist, 'favicon.svg'))) {
  cpSync(join(dist, 'favicon.svg'), rootFavicon)
}
if (existsSync(join(dist, '.nojekyll'))) {
  cpSync(join(dist, '.nojekyll'), rootNojekyll)
} else {
  writeFileSync(rootNojekyll, '')
}

console.log('Synced dist/ → repo root (index.html, assets/, favicon.svg, .nojekyll)')
