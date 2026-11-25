import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';

const linux = { skip: process.platform !== 'linux' };
const fingerprint = 'A'.repeat(40);
const images = Object.fromEntries(['api', 'migrate', 'web'].map((component, index) => [
  component,
  `ghcr.io/georgenton/fundacion-bienestar-emocional-${component}@sha256:${String(index + 1).repeat(64)}`,
]));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'fbe-backup-cycle-test-'));
  const scratch = mkdtempSync('/dev/shm/fbe-backup-cycle-test-');
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(scratch, { recursive: true, force: true });
  });
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const cycle = join(root, 'staging-backup-cycle.sh');
  const status = join(root, 'status.json');
  const events = join(root, 'events');
  const manifest = join(root, 'release.json');
  copyFileSync(new URL('./staging-backup-cycle.sh', import.meta.url), cycle);
  writeFileSync(events, '');
  writeFileSync(status, JSON.stringify({ status: 'verified', captured_at: 1 }));
  writeFileSync(manifest, JSON.stringify({
    source_repository: 'georgenton/fundacion-bienestar-emocional',
    source_sha: 'a'.repeat(40),
    verification: { image_smoke: 'passed' },
    images,
  }));
  writeFileSync(join(bin, 'docker'), `#!/usr/bin/env bash
set -eu
[[ "$1" = inspect && "$2" = --format && "$3" = '{{.Config.Image}}' ]]
case "$4" in
  fbe-api) component=api; image=$TEST_API_IMAGE ;;
  fbe-migrate) component=migrate; image=$TEST_MIGRATE_IMAGE ;;
  fbe-web) component=web; image=$TEST_WEB_IMAGE ;;
  *) exit 90 ;;
esac
printf 'inspect|%s\\n' "$component" >> "$TEST_EVENTS"
if [[ "$TEST_INSPECT_FAILURE" = "$component" ]]; then exit 71; fi
if [[ "$TEST_MISMATCH" = "$component" ]]; then image='unexpected:tag'; fi
printf '%s\\n' "$image"
`, { mode: 0o700 });
  writeFileSync(join(root, 'staging-recovery-material.sh'), `#!/usr/bin/env bash
set -eu
[[ "$1 $2 $3" = 'fbe-db fbe-api fbe-migrate' ]]
[[ -z "$(find "$5" -mindepth 1 -maxdepth 1 -print -quit)" ]]
[[ "$(stat -c %a "$5")" = 700 && "$(stat -f -c %T "$5")" = tmpfs ]]
printf 'capture|%s|%s\\n' "$5" "$TEST_GENERATION" >> "$TEST_EVENTS"
printf 'fixture_generation=%s\\n' "$TEST_GENERATION" > "$5/api.env"
if [[ "$TEST_CAPTURE_FAILURE" = true ]]; then exit 42; fi
printf 'synthetic migration fixture\\n' > "$5/migration.env"
printf 'synthetic role fixture\\n' > "$5/roles.sql"
cp "$4" "$5/release.json"
`);
  writeFileSync(join(root, 'staging-backup-job.sh'), `#!/usr/bin/env bash
set -eu
[[ "$1" = fbe-db && "$3" = "$TEST_FINGERPRINT" ]]
[[ "$TMPDIR/recovery" = "$2" ]]
for name in api.env migration.env roles.sql release.json; do [[ -s "$2/$name" ]]; done
printf 'upload|%s|%s\\n' "$2" "$(cat "$2/api.env")" >> "$TEST_EVENTS"
if [[ "$TEST_JOB_FAILURE" = true ]]; then exit 43; fi
printf '{"status":"verified","captured_at":%s}\\n' "$(date +%s)" > "$4"
printf 'verified-by-existing-job-contract\\n'
`);

  function run(overrides = {}) {
    const result = spawnSync('bash', [cycle, 'fbe-db', 'fbe-api', 'fbe-migrate', 'fbe-web', manifest, fingerprint, status], {
      encoding: 'utf8',
      timeout: 10000,
      env: {
        ...process.env,
        PATH: [bin, process.env.PATH].join(delimiter),
        TMPDIR: scratch,
        TEST_EVENTS: events,
        TEST_FINGERPRINT: fingerprint,
        TEST_API_IMAGE: images.api,
        TEST_MIGRATE_IMAGE: images.migrate,
        TEST_WEB_IMAGE: images.web,
        TEST_INSPECT_FAILURE: '',
        TEST_MISMATCH: '',
        TEST_GENERATION: 'first',
        TEST_CAPTURE_FAILURE: 'false',
        TEST_JOB_FAILURE: 'false',
        ...overrides,
      },
    });
    assert.ifError(result.error);
    assert.deepEqual(readdirSync(scratch), [], 'all per-run recovery material was removed');
    assert.ok(!readdirSync(root).some((name) => name.startsWith('.fbe-cycle-status.')), 'status temporary files were removed');
    const recorded = JSON.parse(readFileSync(status, 'utf8'));
    assert.ok(Number.isSafeInteger(recorded.captured_at));
    return { result, recorded, events: readFileSync(events, 'utf8').trim().split('\n').filter(Boolean) };
  }
  return { run, bin };
}

test('each cycle captures fresh material in a different private tmpfs directory before upload', linux, (t) => {
  const setup = fixture(t);
  const first = setup.run();
  assert.equal(first.result.status, 0, first.result.stderr);
  assert.equal(first.recorded.status, 'verified');
  assert.equal(first.result.stdout, 'verified-by-existing-job-contract\n');
  const second = setup.run({ TEST_GENERATION: 'second' });
  assert.equal(second.result.status, 0, second.result.stderr);
  assert.equal(second.recorded.status, 'verified');
  const captures = second.events.filter((line) => line.startsWith('capture|'));
  assert.equal(captures.length, 2);
  assert.notEqual(captures[0].split('|')[1], captures[1].split('|')[1]);
  const uploads = second.events.filter((line) => line.startsWith('upload|'));
  assert.match(uploads[0], /fixture_generation=first$/);
  assert.match(uploads[1], /fixture_generation=second$/);
  assert.deepEqual(second.events.map((line) => line.split('|')[0]), [
    'inspect', 'inspect', 'inspect', 'capture', 'upload',
    'inspect', 'inspect', 'inspect', 'capture', 'upload',
  ]);
});

test('a mismatch in any of the three active image digests fails before capture or upload', linux, (t) => {
  for (const component of ['api', 'migrate', 'web']) {
    const observed = fixture(t).run({ TEST_MISMATCH: component });
    assert.equal(observed.result.status, 1);
    assert.equal(observed.recorded.status, 'failed');
    assert.ok(observed.recorded.captured_at > 1);
    assert.ok(observed.events.every((line) => line.startsWith('inspect|')));
    assert.equal(observed.result.stdout, '');
  }
});

test('a failed image inspection cannot reach capture or upload', linux, (t) => {
  const observed = fixture(t).run({ TEST_INSPECT_FAILURE: 'web' });
  assert.equal(observed.result.status, 1);
  assert.equal(observed.recorded.status, 'failed');
  assert.ok(observed.events.every((line) => line.startsWith('inspect|')));
});

test('a missing or non-tmpfs work directory is rejected and records failure', linux, (t) => {
  const missing = fixture(t).run({ TMPDIR: '' });
  assert.equal(missing.result.status, 2);
  assert.equal(missing.recorded.status, 'failed');
  assert.deepEqual(missing.events, []);
  const setup = fixture(t);
  writeFileSync(join(setup.bin, 'stat'), '#!/usr/bin/env bash\nprintf "ext2/ext3\\n"\n', { mode: 0o700 });
  const disk = setup.run();
  assert.equal(disk.result.status, 2);
  assert.equal(disk.recorded.status, 'failed');
  assert.deepEqual(disk.events, []);
});

test('a partial capture is cleaned and replaces an earlier verified state without upload', linux, (t) => {
  const observed = fixture(t).run({ TEST_CAPTURE_FAILURE: 'true' });
  assert.equal(observed.result.status, 42);
  assert.equal(observed.recorded.status, 'failed');
  assert.ok(observed.recorded.captured_at > 1);
  assert.equal(observed.events.filter((line) => line.startsWith('capture|')).length, 1);
  assert.ok(!observed.events.some((line) => line.startsWith('upload|')));
  assert.equal(observed.result.stdout, '');
});

test('a failed backup job cannot preserve an earlier verified state', linux, (t) => {
  const observed = fixture(t).run({ TEST_JOB_FAILURE: 'true' });
  assert.equal(observed.result.status, 43);
  assert.equal(observed.recorded.status, 'failed');
  assert.equal(observed.events.filter((line) => line.startsWith('upload|')).length, 1);
  assert.equal(observed.result.stdout, '');
});
