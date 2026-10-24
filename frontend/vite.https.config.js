import { defineConfig, mergeConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import base from './vite.config.js';

// `npm run dev:https` -> https://<your-pc-ip>:5173 with a self-signed certificate.
// Phones only allow camera-location (GPS) on https:// pages, so use this when testing from a phone.
export default mergeConfig(base, defineConfig({ plugins: [basicSsl()] }));
