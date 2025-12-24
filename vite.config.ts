import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  console.log("Build mode", mode);
  const devBuild = mode === 'development';

  return {
    plugins: [preact()],
    build: {
      sourcemap: devBuild,
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
