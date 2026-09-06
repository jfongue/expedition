import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Vite does not read PORT on its own; honouring it lets a harness or a second
  // checkout run the dev server on a port it picked.
  server: { port: Number(process.env.PORT) || 5173 },
})
