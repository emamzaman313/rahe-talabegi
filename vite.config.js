import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        main: 'index.html',
        supportAdmin: 'support-admin.html'
      }
    }
  }
});
