import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy API + uploaded photos to Django, so the app also works from a phone on the same Wi-Fi.
const backend = 'http://127.0.0.1:8000';
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true, proxy: { '/api': backend, '/media': backend } },
});
