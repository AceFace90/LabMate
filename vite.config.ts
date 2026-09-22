import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path matches a GitHub Pages project site (personal/<repo>) when we get to phase 2 deployment.
export default defineConfig({
  plugins: [react()],
  base: './',
})
