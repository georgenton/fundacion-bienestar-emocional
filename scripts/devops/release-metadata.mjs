import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { validateDigest, validatePublicOrigin, validateRepository } from './release-validation.mjs';

assert.equal(process.env.GITHUB_EVENT_NAME, 'push', 'Only a main push can publish a release.');
assert.equal(process.env.GITHUB_REF, 'refs/heads/main', 'Only main can publish a release.');
const repository = validateRepository(process.env.GITHUB_REPOSITORY);
const sha = process.env.GITHUB_SHA ?? '';
assert.match(sha, /^[a-f0-9]{40}$/, 'A full commit SHA is required.');
const publicOrigin = validatePublicOrigin(process.env.FBE_PUBLIC_API_ORIGIN);
const prefix = `ghcr.io/${repository.toLowerCase()}`;

if (process.argv[2] === 'inputs') {
  assert.ok(process.env.GITHUB_OUTPUT, 'GitHub output file is missing.');
  appendFileSync(process.env.GITHUB_OUTPUT, `image_prefix=${prefix}\npublic_api_origin=${publicOrigin}\n`);
} else if (process.argv[2] === 'write') {
  const runId = process.env.GITHUB_RUN_ID ?? '';
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT ?? '';
  assert.match(runId, /^[1-9][0-9]*$/);
  assert.match(runAttempt, /^[1-9][0-9]*$/);
  const manifest = {
    schema_version: 1,
    source_repository: repository,
    source_sha: sha,
    workflow_run_id: runId,
    workflow_run_attempt: runAttempt,
    created_at: new Date().toISOString(),
    platform: 'linux/amd64',
    public_api_origin: publicOrigin,
    images: {
      api: `${prefix}-api@${validateDigest(process.env.API_DIGEST)}`,
      migrate: `${prefix}-migrate@${validateDigest(process.env.MIGRATE_DIGEST)}`,
      web: `${prefix}-web@${validateDigest(process.env.WEB_DIGEST)}`,
    },
    verification: { source_ci: 'passed', image_smoke: 'passed' },
  };
  mkdirSync('.local/release', { recursive: true });
  writeFileSync('.local/release/release.json', JSON.stringify(manifest, null, 2) + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `## Verified container images published\n\nSource: \`${sha}\`. Platform: linux/amd64.\n\nUse the release artifact for immutable digest references. Staging has not been deployed by this workflow.\n`);
  console.log('Release manifest written after published-image smoke verification.');
} else {
  throw new Error('Use release-metadata.mjs inputs or write.');
}
