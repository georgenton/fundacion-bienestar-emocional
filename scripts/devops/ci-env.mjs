import { randomBytes } from 'node:crypto';
import { appendFileSync, writeFileSync } from 'node:fs';

if (process.env.CI !== 'true') {
  throw new Error('This script only creates an ephemeral CI environment.');
}

const password = randomBytes(32).toString('base64url');
const authSecret = randomBytes(48).toString('base64url');
const database = 'fbe_ci_synthetic';
const user = 'fbe_ci';
const hostUrl = `postgresql://${user}:${password}@localhost:55432/${database}?schema=public`;
const containerUrl = `postgresql://${user}:${password}@postgres:5432/${database}?schema=public`;
const values = {
  APP_ENV: 'test',
  APP_NAME: 'FBE-CI-Synthetic',
  API_PORT: '3001',
  WEB_ORIGIN: 'http://localhost:3000',
  NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3001',
  BETTER_AUTH_URL: 'http://localhost:3001',
  BETTER_AUTH_SECRET: authSecret,
  AUTH_RESET_TOKEN_TTL_SECONDS: '900',
  POSTGRES_DB: database,
  POSTGRES_USER: user,
  POSTGRES_PASSWORD: password,
  DATABASE_URL: hostUrl,
  CONTAINER_DATABASE_URL: containerUrl,
  ALLOW_SYNTHETIC_SEED: 'false',
  SYNTHETIC_DATA_ONLY: 'true',
  LOG_LEVEL: 'info',
};

// Register masks before any subsequent command can emit the generated values.
if (process.env.GITHUB_ACTIONS === 'true') {
  for (const value of [password, authSecret, hostUrl, containerUrl]) {
    process.stdout.write(`::add-mask::${value}\n`);
  }
}
const text = Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join('');
// Never overwrite a developer's existing environment.
writeFileSync('.env', text, { flag: 'wx', mode: 0o600 });
if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, text);
console.log('Ephemeral synthetic CI environment created; credentials are not artifacts.');
