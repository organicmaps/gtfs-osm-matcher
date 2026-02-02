import { defineConfig, type Plugin } from 'vite'
import fs from 'fs'
import path from 'path'
import preact from '@preact/preset-vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  console.log("Build mode", mode);
  const devBuild = mode === 'development';
  return {
    plugins: [preact(), selectiveOutDirCleanup({ preserve: ['data'] })],
    build: {
      sourcemap: devBuild,
      emptyOutDir: false,
      rollupOptions: {
        output: {
          manualChunks: {
            preact: ['preact', 'preact/hooks', 'preact/compat'],
            maplibre: ['maplibre-gl']
          }
        }
      }
    },
    server: {
      proxy: {
        '/data': {
          target: 'http://localhost:8801',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/data/, ''),
        }
      },
    }
  }
});

function selectiveOutDirCleanup(options?: { preserve?: string[] }) {
  const { preserve = [] } = options || {};

  let outDir = 'dist';

  return {
    name: 'selective-out-dir-cleanup',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    buildStart() {
      if (fs.existsSync(outDir)) {
        fs.readdirSync(outDir).forEach(file => {
          if (!preserve.includes(file)) {
            fs.rmSync(path.join(outDir, file), { recursive: true, force: true });
          }
        });
      }
    }
  } as Plugin
}