import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadRuntimeEnvironment } from '../env-loader.js';

test('Root env wins over legacy backend env, and process overrides still win', () => {
  const directory = path.resolve('fixture-project', 'backend'), root = path.dirname(directory);
  const files = new Map([
    [path.join(root, '.env'), { transport: 'scrapingant', key: 'fixture-service-key', port: '5000' }],
    [path.join(directory, '.env'), { transport: 'curl', legacyFallback: '1' }],
    [path.join(root, 'outputs', 'booking-app-probe', 'server.env'), { appVersion: 'fixture' }],
  ]);
  const environment = { port: '5500' }, loaded = [];
  loadRuntimeEnvironment({ backendDirectory: directory, exists: file => files.has(file), load: file => {
    loaded.push(file);
    for (const [key, value] of Object.entries(files.get(file))) environment[key] ??= value;
  } });
  assert.equal(environment.transport, 'scrapingant');
  assert.equal(environment.key, 'fixture-service-key');
  assert.equal(environment.port, '5500');
  assert.equal(environment.legacyFallback, '1');
  assert.equal(environment.appVersion, 'fixture');
  assert.deepEqual(loaded, [...files.keys()]);
});
