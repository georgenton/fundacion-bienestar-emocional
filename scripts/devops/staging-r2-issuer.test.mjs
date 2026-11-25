import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { test } from "node:test";
import issuer from "../../infra/cloudflare/staging-r2-issuer.mjs";

const env = {
  FBE_ISSUER_CLIENT_TOKEN: "a".repeat(64),
  FBE_R2_ACCOUNT_ID: "b".repeat(32),
  FBE_R2_BUCKET: "fixture-bucket",
  FBE_R2_PARENT_ACCESS_KEY_ID: "c".repeat(32),
  FBE_R2_PARENT_SECRET_ACCESS_KEY: "d".repeat(64),
  FBE_R2_BUDGET_REVIEW_UNTIL: new Date(Date.now() + 3600_000).toISOString(),
};

function request(token = env.FBE_ISSUER_CLIENT_TOKEN, path = "/session") {
  return new Request("https://issuer.example.test" + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: JSON.stringify({ bucket: "ignored", prefix: "ignored", ttlSeconds: 86400 }),
  });
}

test("the issuer rejects invalid bearer, wrong route and stale quota review", async () => {
  assert.equal((await issuer.fetch(request("e".repeat(64)), env)).status, 403);
  assert.equal((await issuer.fetch(request(undefined, "/other"), env)).status, 404);
  const stopped = await issuer.fetch(request(), { ...env, FBE_R2_BUDGET_REVIEW_UNTIL: "" });
  assert.equal(stopped.status, 503);
});

test("each session is distinct, short-lived, and signed for only the fixed FBE operations", async () => {
  const result = await issuer.fetch(request(), env);
  assert.match(result.headers.get("cache-control"), /no-store/);
  const first = await result.json();
  const second = await (await issuer.fetch(request(), env)).json();
  assert.notEqual(first.SessionToken, second.SessionToken);
  const jwt = Buffer.from(first.SessionToken, "base64").toString().slice("jwt/".length);
  const [header, payload, signature] = jwt.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url"));
  assert.equal(claims.bucket, env.FBE_R2_BUCKET);
  assert.deepEqual(claims.paths, { prefixPaths: ["fbe/staging/"], objectPaths: [] });
  assert.deepEqual(claims.actions, ["PutObject", "GetObject", "HeadObject"]);
  assert.equal(claims.exp - claims.iat, 1800);
  assert.equal(Date.parse(first.Expiration), claims.exp * 1000);
  assert.equal(first.AccessKeyId, env.FBE_R2_PARENT_ACCESS_KEY_ID);
  assert.equal(signature, createHmac("sha256", env.FBE_R2_PARENT_SECRET_ACCESS_KEY)
    .update(header + "." + payload).digest("base64url"));
  assert.equal(first.SecretAccessKey, createHash("sha256").update(jwt).digest("hex"));
});
