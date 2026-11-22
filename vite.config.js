import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:5000' } },
  // A single fork keeps test behaviour deterministic on constrained Windows
  // environments and avoids sharing the in-memory demo account state.
  test: { environment: 'node', setupFiles: ['./tests/setup.js'], pool: 'forks', minWorkers: 1, maxWorkers: 1, exclude: ['tests/browser/**', 'node_modules/**'] }
})
