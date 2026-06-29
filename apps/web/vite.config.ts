import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '../..')

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Force all imports of react/react-dom to resolve to the same instance.
    // Prevents "Cannot read properties of null (reading 'useRef')" caused by
    // duplicate React when both root node_modules and apps/web/node_modules
    // contain their own copy.
    alias: {
      '@': path.resolve(__dirname, 'src'),
      react: path.resolve(workspaceRoot, 'node_modules/react'),
      'react-dom': path.resolve(workspaceRoot, 'node_modules/react-dom'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
