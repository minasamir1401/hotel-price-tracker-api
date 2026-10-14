import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRuntimeEnvironment } from './env-loader.js';

// Must evaluate before importing scrapers that initialize configured clients.
loadRuntimeEnvironment({ backendDirectory: path.dirname(fileURLToPath(import.meta.url)) });
