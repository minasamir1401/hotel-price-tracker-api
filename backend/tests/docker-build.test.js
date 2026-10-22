import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const rootDocker = readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8');
const backendDocker = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
const installRun = text => text.match(/RUN set -eu;[\s\S]*?(?=\n\n)/)[0].replace(/^RUN /, '').replace(/\\\r?\n/g, ' ');
const shell = process.env.TEST_POSIX_SHELL || (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/sh');
const shellTest = existsSync(shell) ? test : test.skip;

test('Both Docker build contexts use the same verified APT installation step', () => {
  assert.equal(installRun(rootDocker), installRun(backendDocker));
  assert.match(installRun(rootDocker), /APT::Update::Error-Mode=any/);
  assert.doesNotMatch(installRun(rootDocker), /allow-unauthenticated|AllowInsecureRepositories|Verify-Peer=false|trusted=yes/);
});

shellTest('Ubuntu source rewrite uses HTTPS for both source formats and leaves NodeSource intact', () => {
  const expression = installRun(rootDocker).match(/sed -i -E '([^']+)'/)[1];
  const source = 'URIs: http://azure.archive.ubuntu.com/ubuntu\n' +
    'deb http://security.ubuntu.com/ubuntu noble-security main\n' +
    'deb https://deb.nodesource.com/node_24.x nodistro main\n';
  const result = spawnSync(shell, ['-s'], { input: `printf '%s' '${source}' | sed -E '${expression}'\n`, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'URIs: https://archive.ubuntu.com/ubuntu\n' +
    'deb https://security.ubuntu.com/ubuntu noble-security main\n' +
    'deb https://deb.nodesource.com/node_24.x nodistro main\n');
});

shellTest('The complete Docker RUN command parses as a POSIX shell script', () => {
  const result = spawnSync(shell, ['-n'], { input: installRun(rootDocker), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

function simulate(failedUpdates, failedInstalls) {
  // Run the actual retry loop with shell functions; no package or filesystem changes.
  const loop = installRun(rootDocker).split('  python3 -m venv')[0];
  const mocks = `updates=0; installs=0;
rm() { echo CLEAN; }
sleep() { echo WAIT; }
sed() { :; }
apt-get() {
  case "$*" in
    *update) updates=$((updates + 1)); echo UPDATE;
      if [ "$updates" -le ${failedUpdates} ]; then echo 'Hash Sum mismatch' >&2; return 100; fi ;;
    *install*) installs=$((installs + 1)); echo INSTALL;
      if [ "$installs" -le ${failedInstalls} ]; then return 100; fi ;;
    *) return 99 ;;
  esac
}
`;
  return spawnSync(shell, ['-s'], { input: mocks + loop + '\necho READY\n', encoding: 'utf8', timeout: 5000 });
}

shellTest('A hash mismatch discards indexes and refreshes successfully before package installation', () => {
  const result = simulate(1, 0);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/), ['CLEAN', 'UPDATE', 'WAIT', 'CLEAN', 'UPDATE', 'INSTALL', 'READY']);
});

shellTest('A failed package download repeats update and install with fresh indexes', () => {
  const result = simulate(0, 1);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/), ['CLEAN', 'UPDATE', 'INSTALL', 'WAIT', 'CLEAN', 'UPDATE', 'INSTALL', 'READY']);
});

shellTest('Persistent index failure exits after three attempts without installing or continuing the build', () => {
  const result = simulate(3, 0);
  assert.equal(result.status, 100, result.stderr);
  assert.equal(result.stdout.match(/UPDATE/g)?.length, 3);
  assert.doesNotMatch(result.stdout, /INSTALL|READY/);
  assert.match(result.stderr, /APT failed after 3 attempts/);
});
