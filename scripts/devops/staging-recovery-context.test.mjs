import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const drill = fileURLToPath(new URL('./staging-recovery-drill.sh', import.meta.url));

function run(t, { endpoint = 'unix:///fixture/docker.sock', context = 'desktop-linux', inspectFails = false, overrides = {} } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'fbe-recovery-context-test-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const scratch = join(tmp, 'scratch');
  const calls = join(tmp, 'calls');
  mkdirSync(scratch);
  writeFileSync(calls, '');
  writeFileSync(join(tmp, 'docker'), `#!/usr/bin/env bash
set -eu
printf '%s|%s\\n' "\${DOCKER_CONTEXT:-}" "$*" >> "$TEST_DOCKER_CALLS"
case "$1 \${2:-}" in
  'context show') printf '%s\\n' "$TEST_CONTEXT" ;;
  'context inspect')
    [[ "$TEST_INSPECT_FAILS" = false ]] || exit 1
    printf '%s\\n' "$TEST_ENDPOINT"
    ;;
  'network create') exit 73 ;;
esac
`, { mode: 0o700 });
  writeFileSync(join(tmp, 'gpgconf'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o700 });
  const env = {
    ...process.env,
    PATH: [tmp, process.env.PATH].join(delimiter),
    TMPDIR: scratch,
    DOCKER_HOST: '',
    DOCKER_CONTEXT: '',
    TEST_DOCKER_CALLS: calls,
    TEST_CONTEXT: context,
    TEST_ENDPOINT: endpoint,
    TEST_INSPECT_FAILS: String(inspectFails),
    ...overrides,
  };
  const result = spawnSync('bash', [drill], { env, encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error);
  assert.deepEqual(readdirSync(scratch), [], 'temporary rehearsal files were removed');
  return { result, calls: readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean) };
}

for (const endpoint of ['ssh://operator@remote.invalid', 'tcp://127.0.0.1:2375', '']) {
  test(`the local rehearsal rejects endpoint ${endpoint || '(empty)'} before resource creation`, (t) => {
    const observed = run(t, { endpoint });
    assert.equal(observed.result.status, 2, observed.result.stderr);
    assert.ok(observed.calls.some((line) => line.includes('|context inspect ')));
    assert.ok(observed.calls.every((line) => line.startsWith('|context ')), observed.calls.join('\n'));
  });
}

test('the rehearsal rejects an uninspectable endpoint before resource creation', (t) => {
  const observed = run(t, { inspectFails: true });
  assert.equal(observed.result.status, 2);
  assert.ok(observed.calls.every((line) => line.startsWith('|context ')));
});

test('a different context and Docker environment overrides cannot start the rehearsal', (t) => {
  for (const config of [
    { context: 'remote' },
    { overrides: { DOCKER_HOST: 'ssh://operator@remote.invalid' } },
    { overrides: { DOCKER_CONTEXT: 'remote' } },
  ]) {
    const observed = run(t, config);
    assert.equal(observed.result.status, 2);
    assert.ok(observed.calls.every((line) => line === '|context show' || line === 'remote|context show'));
  }
});

test('the accepted Unix context remains pinned for resource creation and cleanup', (t) => {
  const observed = run(t);
  // The Docker substitute stops at the first mutation; no daemon or network is used.
  assert.equal(observed.result.status, 73, observed.result.stderr);
  assert.ok(observed.calls.some((line) => line.startsWith('desktop-linux|network create --internal ')));
  const mutations = observed.calls.filter((line) => !line.includes('|context '));
  assert.ok(mutations.length > 1, 'cleanup was also exercised');
  assert.ok(mutations.every((line) => line.startsWith('desktop-linux|')), mutations.join('\n'));
});
