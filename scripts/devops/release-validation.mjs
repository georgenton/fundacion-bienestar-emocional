import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const shaPattern = /^[a-f0-9]{40}$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const repositoryPattern = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/;

export function validateRepository(value) {
  assert.equal(typeof value, 'string', 'Repository is required.');
  assert.match(value, repositoryPattern, 'Invalid repository.');
  return value;
}

export function validatePublicOrigin(value) {
  assert.equal(typeof value, 'string', 'The public API origin is required.');
  const parsed = new URL(value);
  assert.equal(parsed.protocol, 'https:', 'The public API must use HTTPS.');
  assert.ok(!parsed.username && !parsed.password, 'An origin cannot contain credentials.');
  assert.equal(parsed.pathname, '/', 'Use an origin without a path.');
  assert.ok(!parsed.search && !parsed.hash, 'Use an origin without a query or fragment.');
  assert.ok(!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname), 'Use the real staging origin.');
  assert.ok(!parsed.hostname.endsWith('.localhost'), 'Use the real staging origin.');
  assert.equal(value, parsed.origin, 'Use the canonical origin without a trailing slash.');
  return parsed.origin;
}

export function validateDigest(value) {
  assert.equal(typeof value, 'string', 'An image digest is required.');
  assert.match(value, digestPattern, 'Invalid image digest.');
  return value;
}

export function validateRun(run, repository) {
  validateRepository(repository);
  assert.ok(run && typeof run === 'object', 'Workflow run is missing.');
  assert.equal(run.status, 'completed', 'CI must be completed.');
  assert.equal(run.conclusion, 'success', 'CI must have passed.');
  assert.equal(run.event, 'push', 'Only a push to main can supply release images.');
  assert.equal(run.head_branch, 'main', 'Only main can supply release images.');
  assert.ok(
    ['.github/workflows/ci.yml', '.github/workflows/ci.yml@main', '.github/workflows/ci.yml@refs/heads/main'].includes(run.path),
    'Unexpected source workflow.',
  );
  assert.equal(run.repository?.full_name, repository, 'Run belongs to another repository.');
  assert.equal(run.head_repository?.full_name, repository, 'Fork runs cannot be promoted.');
  assert.match(run.head_sha ?? '', shaPattern, 'A full source SHA is required.');
  assert.ok(Number.isSafeInteger(run.id) && run.id > 0, 'Invalid workflow run ID.');
  assert.ok(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0, 'Invalid run attempt.');
  return run;
}

export function artifactName(run) {
  return `release-${run.head_sha}-${run.id}-${run.run_attempt}`;
}

export function validateManifest(manifest, run, repository, expectedOrigin) {
  validateRun(run, repository);
  assert.equal(manifest?.schema_version, 1, 'Unsupported release manifest.');
  assert.equal(manifest.source_repository, repository, 'Manifest repository does not match.');
  assert.equal(manifest.source_sha, run.head_sha, 'Manifest SHA does not match passed CI.');
  assert.equal(manifest.workflow_run_id, String(run.id), 'Manifest run ID does not match.');
  assert.equal(manifest.workflow_run_attempt, String(run.run_attempt), 'Manifest run attempt does not match.');
  assert.equal(manifest.platform, 'linux/amd64', 'Unexpected image platform.');
  assert.equal(manifest.verification?.source_ci, 'passed', 'Source verification is missing.');
  assert.equal(manifest.verification?.image_smoke, 'passed', 'Published image verification is missing.');
  const publicOrigin = validatePublicOrigin(manifest.public_api_origin);
  if (expectedOrigin !== undefined) assert.equal(publicOrigin, validatePublicOrigin(expectedOrigin), 'The built API origin differs from the configured staging origin.');
  const imagePrefix = `ghcr.io/${repository.toLowerCase()}`;
  const images = {};
  for (const component of ['api', 'migrate', 'web']) {
    const expectedPrefix = `${imagePrefix}-${component}@`;
    const reference = manifest.images?.[component];
    assert.equal(typeof reference, 'string', `Missing ${component} image.`);
    assert.ok(reference.startsWith(expectedPrefix), 'Image is outside the expected package.');
    validateDigest(reference.slice(expectedPrefix.length));
    images[component] = reference;
  }
  // Return an allowlisted document; untrusted extra artifact fields are discarded.
  return {
    schema_version: 1,
    source_repository: repository,
    source_sha: run.head_sha,
    workflow_run_id: String(run.id),
    workflow_run_attempt: String(run.run_attempt),
    platform: 'linux/amd64',
    public_api_origin: publicOrigin,
    images,
    verification: { source_ci: 'passed', image_smoke: 'passed' },
    deployment_status: 'handoff_only_not_deployed',
  };
}

async function main() {
  const repository = validateRepository(process.env.GITHUB_REPOSITORY);
  const directory = '.local/staging';
  mkdirSync(directory, { recursive: true });
  if (process.argv[2] === 'run') {
    const input = process.env.CI_RUN_ID ?? '';
    assert.match(input, /^[1-9][0-9]*$/, 'Supply a successful CI run ID, not a commit or URL.');
    assert.ok(Number.isSafeInteger(Number(input)), 'Run ID exceeds the safe integer range.');
    assert.ok(process.env.GH_TOKEN, 'A read-only Actions token is required.');
    const response = await fetch(`https://api.github.com/repos/${repository}/actions/runs/${input}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        'X-GitHub-Api-Version': '2026-03-10',
      },
      signal: AbortSignal.timeout(20_000),
    });
    assert.ok(response.ok, `Unable to read the requested CI run (HTTP ${response.status}).`);
    const run = validateRun(await response.json(), repository);
    assert.equal(String(run.id), input, 'API returned a different run.');
    const savedRun = {
      id: run.id, run_attempt: run.run_attempt, head_sha: run.head_sha,
      status: run.status, conclusion: run.conclusion, event: run.event,
      head_branch: run.head_branch, path: run.path,
      repository: { full_name: repository }, head_repository: { full_name: repository },
    };
    writeFileSync(`${directory}/run.json`, JSON.stringify(savedRun, null, 2) + '\n');
    assert.ok(process.env.GITHUB_OUTPUT, 'GitHub output file is missing.');
    appendFileSync(process.env.GITHUB_OUTPUT, `sha=${run.head_sha}\nrun_id=${run.id}\nartifact_name=${artifactName(run)}\n`);
    console.log('Passed main-branch CI verified; downloading its exact release artifact next.');
  } else if (process.argv[2] === 'manifest') {
    const run = JSON.parse(readFileSync(`${directory}/run.json`, 'utf8'));
    const manifest = JSON.parse(readFileSync(`${directory}/artifact/release.json`, 'utf8'));
    const handoff = validateManifest(manifest, run, repository, process.env.FBE_PUBLIC_API_ORIGIN ?? '');
    writeFileSync(`${directory}/handoff.json`, JSON.stringify(handoff, null, 2) + '\n');
    writeFileSync(`${directory}/handoff.env`, [
      `FBE_RELEASE_SHA=${handoff.source_sha}`,
      `FBE_API_IMAGE=${handoff.images.api}`,
      `FBE_MIGRATE_IMAGE=${handoff.images.migrate}`,
      `FBE_WEB_IMAGE=${handoff.images.web}`,
      `FBE_PUBLIC_API_ORIGIN=${handoff.public_api_origin}`,
      '',
    ].join('\n'));
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `## Staging handoff prepared — no deployment executed\n\nSource: \`${handoff.source_sha}\`. CI run: ${handoff.workflow_run_id}.\n\nThe artifact contains verified image digests and the built API origin. Configure and review the isolated Coolify resource before deploying.\n`);
    console.log('Validated image handoff prepared. No Coolify deployment was requested.');
  } else {
    throw new Error('Use release-validation.mjs run or manifest.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
