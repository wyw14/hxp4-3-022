import { defineConfig } from 'vite'
import { resolve } from 'path'
import { existsSync, readFileSync } from 'fs'

function getBackendPort(): number {
  const portFile = resolve(__dirname, '..', 'backend', '.port');
  if (existsSync(portFile)) {
    try {
      const port = parseInt(readFileSync(portFile, 'utf-8').trim());
      if (!isNaN(port) && port > 0 && port < 65536) {
        return port;
      }
    } catch {
    }
  }
  return parseInt(process.env.BACKEND_PORT || '3003');
}

const backendPort = getBackendPort();

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true
      }
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html')
      }
    }
  }
});

console.log(`🔌 Vite 代理已配置到后端端口: ${backendPort}`);
