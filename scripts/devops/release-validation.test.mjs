import assert from 'node:assert/strict';
import test from 'node:test';
import { artifactName, validateManifest, validatePublicOrigin, validateRun } from './release-validation.mjs';

const repository = 'fixture/fbe-synthetic';
const sha = 'a'.repeat(40);
const origin = 'https://api.fixture.invalid';
function runFixture() {
  return {
    id: 123, run_attempt: 2, head_sha: sha, status: 'completed', conclusion: 'success',
    event: 'push', head_branch: 'main', path: '.github/workflows/ci.yml',
    repository: { full_name: repository }, head_repository: { full_name: repository },
  };
}
function manifestFixture() {
  return {
    schema_version: 1, source_repository: repository, source_sha: sha,
    workflow_run_id: '123', workflow_run_attempt: '2', platform: 'linux/amd64',
    public_api_origin: origin,
    verification: { source_ci: 'passed', image_smoke: 'passed' },
    images: Object.fromEntries(['api', 'migrate', 'web'].map((component) =>
      [component, `ghcr.io/${repository}-${component}@sha256:${'b'.repeat(64)}`])),
  };
}

test('accepts a passed main run and its exact image manifest, strips extra artifact fields', () => {
  const run = runFixture();
  const manifest = { ...manifestFixture(), injectedField: 'not forwarded' };
  const result = validateManifest(manifest, run, repository, origin);
  assert.equal(result.source_sha, sha);
  assert.equal(result.deployment_status, 'handoff_only_not_deployed');
  assert.equal(Object.hasOwn(result, 'injectedField'), false);
  assert.equal(artifactName(run), `release-${sha}-123-2`);
});

for (const [description, patch] of [
  ['failed CI', { conclusion: 'failure' }],
  ['incomplete CI', { status: 'in_progress' }],
  ['pull request run', { event: 'pull_request' }],
  ['other branch', { head_branch: 'feature' }],
  ['other workflow', { path: '.github/workflows/untrusted.yml' }],
  ['fork origin', { head_repository: { full_name: 'fork/fbe-synthetic' } }],
  ['other repository', { repository: { full_name: 'other/fbe-synthetic' } }],
  ['abbreviated SHA', { head_sha: 'abcd1234' }],
]) {
  test(`rejects ${description}`, () => assert.throws(() => validateRun({ ...runFixture(), ...patch }, repository)));
}

for (const [description, patch] of [
  ['a different source SHA', { source_sha: 'c'.repeat(40) }],
  ['a different source run', { workflow_run_id: '999' }],
  ['an artifact from an earlier attempt', { workflow_run_attempt: '1' }],
  ['a different repository', { source_repository: 'other/repository' }],
  ['an unverified published image', { verification: { source_ci: 'passed', image_smoke: 'failed' } }],
  ['a foreign registry', { images: { ...manifestFixture().images, api: `evil.invalid/image@sha256:${'b'.repeat(64)}` } }],
  ['a mutable image tag', { images: { ...manifestFixture().images, web: `ghcr.io/${repository}-web:latest` } }],
  ['a malformed digest', { images: { ...manifestFixture().images, migrate: `ghcr.io/${repository}-migrate@sha256:abc` } }],
]) {
  test(`rejects manifest with ${description}`, () => assert.throws(() => validateManifest({ ...manifestFixture(), ...patch }, runFixture(), repository, origin)));
}

test('rejects a valid release built for another API origin', () => {
  assert.throws(() => validateManifest(manifestFixture(), runFixture(), repository, 'https://different.fixture.invalid'));
});

test('requires a canonical HTTPS public origin without credentials or a path', () => {
  for (const value of ['http://api.fixture.invalid', 'https://localhost', 'https://127.0.0.1', 'https://api.fixture.invalid/api', 'https://user:pass@api.fixture.invalid', 'https://api.fixture.invalid/?x=1', 'https://api.fixture.invalid/']) {
    assert.throws(() => validatePublicOrigin(value));
  }
});

test('accepts the documented GitHub workflow path suffix', () => {
  assert.doesNotThrow(() => validateRun({ ...runFixture(), path: '.github/workflows/ci.yml@main' }, repository));
});
