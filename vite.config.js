import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// No manualChunks on purpose: naming recharts as its own chunk dragged React in
// with it, which made every route preload the whole charting library.
// Rollup's own splitting follows the lazy() boundaries correctly.
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
