
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANT: When deploying to GitHub Pages, set `base` to '/<your-repo-name>/'.
// Option A: temporarily edit `base` below before `npm run build`.
// Option B: run `REPO_NAME=<your-repo> npm run build:gh` which overrides base at build time.
export default defineConfig({
  plugins: [react()],
  // base: '/your-repo-name/',
})
