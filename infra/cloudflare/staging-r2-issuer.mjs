// Cloudflare R2's documented local signing format. Parent keys live only in the Worker.
const encoder = new TextEncoder();
const prefix = "fbe/staging/";
const lifetimeSeconds = 30 * 60;

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function hex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function response(status, body) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/session" || url.search) {
      return response(404, { error: "not_found" });
    }
    const authorized = env.FBE_ISSUER_CLIENT_TOKEN;
    const offered = request.headers.get("Authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!offered || !/^[a-f0-9]{64}$/.test(authorized ?? "")) {
      return response(403, { error: "forbidden" });
    }
    let mismatch = 0;
    for (let index = 0; index < 64; index++) {
      mismatch |= offered.charCodeAt(index) ^ authorized.charCodeAt(index);
    }
    if (mismatch) {
      return response(403, { error: "forbidden" });
    }

    const account = env.FBE_R2_ACCOUNT_ID;
    const bucket = env.FBE_R2_BUCKET;
    const parentId = env.FBE_R2_PARENT_ACCESS_KEY_ID;
    const parentSecret = env.FBE_R2_PARENT_SECRET_ACCESS_KEY;
    const now = Math.floor(Date.now() / 1000);
    const expires = now + lifetimeSeconds;
    // A stale or missing quota review suspends issuance; expiry includes the whole session.
    const budgetUntil = Date.parse(env.FBE_R2_BUDGET_REVIEW_UNTIL);
    if (!/^[a-f0-9]{32}$/.test(account ?? "") || !/^[a-z0-9][a-z0-9.-]+$/.test(bucket ?? "") ||
        !/^[a-f0-9]{32}$/.test(parentId ?? "") || !/^[a-f0-9]{64}$/.test(parentSecret ?? "") ||
        !Number.isFinite(budgetUntil) || budgetUntil < expires * 1000) {
      return response(503, { error: "issuer_unavailable" });
    }

    const claims = {
      sub: account, iss: parentId, aud: account + ".r2.cloudflarestorage.com",
      iat: now, exp: expires, jti: crypto.randomUUID(),
      bucket, actions: ["PutObject", "GetObject", "HeadObject"],
      paths: { prefixPaths: [prefix], objectPaths: [] },
    };
    const jwtHeader = base64url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
    const jwtClaims = base64url(encoder.encode(JSON.stringify(claims)));
    const unsigned = jwtHeader + "." + jwtClaims;
    const key = await crypto.subtle.importKey("raw", encoder.encode(parentSecret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(unsigned));
    const jwt = unsigned + "." + base64url(new Uint8Array(signature));
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(jwt));
    return response(200, {
      Version: 1, AccessKeyId: parentId, SecretAccessKey: hex(digest),
      SessionToken: btoa("jwt/" + jwt),
      Expiration: new Date(expires * 1000).toISOString().replace(".000Z", "Z"),
    });
  },
};
