import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Supabase credentials are provisioned without the VITE_ prefix.
  // Expose them to the client so import.meta.env.VITE_SUPABASE_* resolves.
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || '';
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '';
  const r2WorkerUrl = env.VITE_R2_WORKER_URL || '';
  const r2WorkerProxyTarget = env.R2_WORKER_PROXY_TARGET || '';
  const clientWorkerUrl = mode === 'development' && r2WorkerProxyTarget ? '/r2-worker' : r2WorkerUrl;

  return {
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
      'import.meta.env.VITE_R2_WORKER_URL': JSON.stringify(clientWorkerUrl),
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    server: r2WorkerProxyTarget
      ? {
          proxy: {
            '/r2-worker': {
              target: r2WorkerProxyTarget,
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/r2-worker/, ''),
            },
          },
        }
      : undefined,
  };
});
