import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';

async function waitFor(url) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
      if (response.ok) return response;
    } catch {
      // Allow startup, never print response bodies or environment values.
    }
    await setTimeout(1_000);
  }
  throw new Error('Container did not become ready before the smoke-test deadline.');
}

const health = await (await waitFor('http://127.0.0.1:3001/health')).json();
assert.equal(health.status, 'ok');
assert.equal(health.database, 'reachable');
assert.equal(health.syntheticDataOnly, true);
const html = await (await waitFor('http://127.0.0.1:3000/')).text();
assert.match(html, /NO APTO PARA PACIENTES/);
const cases = await fetch('http://127.0.0.1:3001/api/cases', {
  signal: AbortSignal.timeout(3_000),
});
assert.equal(cases.status, 401, 'Protected cases must reject an anonymous request.');
console.log('Image smoke passed: migration dependency, database health, synthetic web and anonymous denial.');
