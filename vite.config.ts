import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages serves this as a project site under /expedition/, not at the
  // domain root — but only the build needs that; the dev server still runs at /.
  base: command === 'build' ? '/expedition/' : '/',
  // Vite does not read PORT on its own; honouring it lets a harness or a second
  // checkout run the dev server on a port it picked.
  server: { port: Number(process.env.PORT) || 5173 },
}))
