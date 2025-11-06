
# Candy Rush 7x7 — Demo (Version A)

Web demo built with Vite + React + Tailwind. Includes Free Game and a local Admin panel (password: `candy`).

## Run locally
```bash
npm install
npm run dev
```

## Deploy to GitHub Pages (recommended)
1. Create a **new GitHub repo** (e.g., `candy-rush-demo`).
2. In the repo Settings → Pages, choose **GitHub Actions** as the source (will be created automatically after first push).
3. Edit `vite.config.js` and set:
   ```js
   export default defineConfig({
     plugins: [react()],
     base: '/<your-repo-name>/', // <= change this
   })
   ```
4. Build and commit:
   ```bash
   npm install
   npm run build
   git add -A
   git commit -m "build"
   git push
   ```
5. Or build with env variable (no file edit):
   ```bash
   REPO_NAME=<your-repo-name> npm run build:gh
   ```
   This will set the correct base during build output in `dist/`.

6. Enable the provided GitHub Action (below). On push to `main`, it builds and publishes to Pages automatically.

## GitHub Actions (auto deploy)
The workflow in `.github/workflows/pages.yml` builds and deploys to Pages on every push to `main`.
