/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { visualizer } from 'rollup-plugin-visualizer'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, existsSync } from 'fs'

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const forward = {
    target: env.VITE_API_URL,
    secure: false,
  } satisfies ProxyOptions
  return {
    plugins: [react(), visualizer({
      emitFile: true,
      filename: 'stats.html',
      gzipSize: true,
    }), tailwindcss()],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      exclude: ['**/node_modules/**', '**/tests/**', '**/*.e2e.{test,spec}.{js,ts}'],
    },
    server: {
      https: command === 'serve' && existsSync('../localhost-key.pem') ? {
        key: readFileSync('../localhost-key.pem'),
        cert: readFileSync('../localhost.pem'),
      } : undefined,
      open: false,
      port: Number(env.PORT),
      proxy: {
        '/api': {
          ...forward,
          changeOrigin: true,
        },
        '/vantage': {
          ...forward,
          changeOrigin: true,
        }
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            // react: ['react', 'react-dom/client'],
            faker: ['@faker-js/faker'],
          }
          // manualChunks(id) {
          //   // if (id.includes('node_modules/@faker-js/faker')) {
          //   //   return 'faker'
          //   // }
          //   if (id.includes('node_modules/react')) {
          //     return 'react'
          //   }
          // }
        },
      },
    }
  }
})
