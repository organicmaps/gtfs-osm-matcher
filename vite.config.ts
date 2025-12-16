import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  console.log("Build mode", mode);
  const devBuild = mode === 'development';

  const SchedulesAPIBase = devBuild ? "http://localhost:4567/v1/schedule" : "https://pt.organicmaps.app/api/v1/schedule";
  const RTUpdatesAPIBase = devBuild ? "http://localhost:4567/v1/updates" : "https://pt.organicmaps.app/api/v1/updates";

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
    define: {
      "SchedulesAPIBase": JSON.stringify(SchedulesAPIBase),
      "RTUpdatesAPIBase": JSON.stringify(RTUpdatesAPIBase),
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
