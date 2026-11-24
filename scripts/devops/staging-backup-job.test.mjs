import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';

test('backup job reports success only after an identical S3 readback', (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'fbe-backup-job-test-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const job = join(tmp, 'staging-backup-job.sh');
  const scratch = join(tmp, 'work');
  const status = join(tmp, 'status.json');
  mkdirSync(scratch);
  copyFileSync(new URL('./staging-backup-job.sh', import.meta.url), job);
  writeFileSync(join(tmp, 'staging-backup.sh'), `printf 'fake ciphertext' > "$4"\n`);
  writeFileSync(join(tmp, 'aws'), `#!/usr/bin/env bash
set -eu
[[ "$1" = --endpoint-url && "$2" = https://backup.example.test && "$3 $4" = "s3 cp" ]]
if [[ "$5" = s3://* ]]; then
  if [[ "$TEST_TRANSPORT" = corrupt ]]; then
    printf 'tampered' > "$6"
  else
    cp "$TEST_OBJECT" "$6"
  fi
else
  if [[ "$TEST_TRANSPORT" = fail ]]; then exit 89; fi
  cp "$5" "$TEST_OBJECT"
fi
`, { mode: 0o700 });

  function run(mode) {
    const result = spawnSync('bash', [job, 'fbe-db', 'fixture', 'fixture', status], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: [tmp, process.env.PATH].join(delimiter),
        TMPDIR: scratch,
        FBE_BACKUP_S3_ENDPOINT: 'https://backup.example.test',
        FBE_BACKUP_S3_PREFIX: 's3://fbe-fixture/fbe/staging/',
        TEST_TRANSPORT: mode,
        TEST_OBJECT: join(tmp, 'object'),
      },
    });
    assert.ifError(result.error);
    assert.deepEqual(readdirSync(scratch), []);
    const recorded = JSON.parse(readFileSync(status, 'utf8'));
    assert.ok(Number.isSafeInteger(recorded.captured_at));
    return { result, recorded };
  }

  const good = run('success');
  assert.equal(good.result.status, 0, good.result.stderr);
  assert.equal(good.recorded.status, 'verified');
  assert.match(good.result.stdout, /backup_id=fbe-staging-\S+ duration_seconds=\d+ ciphertext_sha256=[0-9a-f]{64}/);

  for (const failure of ['fail', 'corrupt']) {
    const bad = run(failure);
    assert.equal(bad.result.status, 1, failure + ': ' + bad.result.stderr);
    assert.equal(bad.recorded.status, 'failed');
    assert.equal(bad.result.stdout, '');
    assert.match(bad.result.stderr, /failed upload or integrity verification/);
  }
});
