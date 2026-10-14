import fs from 'node:fs';
import path from 'node:path';

// One precedence order regardless of whether Node starts in the repo or backend.
// Existing process/container variables still take precedence over every file.
export function loadRuntimeEnvironment({ backendDirectory, exists = fs.existsSync,
  load = process.loadEnvFile } = {}) {
  if (typeof load !== 'function') return;
  const root = path.dirname(backendDirectory);
  for (const file of [path.join(root, '.env'), path.join(backendDirectory, '.env'),
    path.join(root, 'outputs', 'booking-app-probe', 'server.env')]) {
    if (exists(file)) load(file);
  }
}
