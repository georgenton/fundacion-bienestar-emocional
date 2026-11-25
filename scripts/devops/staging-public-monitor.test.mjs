import assert from "node:assert/strict";
import { test } from "node:test";
import worker, { runPublicMonitor } from "../../infra/cloudflare/staging-public-monitor.mjs";

const fiveMinutes = 5 * 60_000;
const start = Date.parse("2026-11-25T10:00:00Z");
const mailbox = "synthetic-alerts@example.test";
const id = "00000000-0000-4000-8000-000000000000";

function setup() {
  const values = new Map();
  const deliveries = [];
  const signals = { synthetic: true, marker: true, webStatus: 200, delivery: 202 };
  const env = {
    FBE_GRAPH_TENANT: id, FBE_GRAPH_CLIENT: id, FBE_GRAPH_MAILBOX: mailbox,
    FBE_GRAPH_CLIENT_SECRET: "synthetic",
    FBE_PUBLIC_STATE: {
      async get(key, format) {
        const value = values.get(key) ?? null;
        return format === "json" ? JSON.parse(value) : value;
      },
      async put(key, value) {
        values.set(key, value);
      },
    },
  };
  async function request(url, options) {
    assert.equal(options.redirect, "manual");
    if (url === "https://fbe-api-staging.syntavera.dev/health") {
      assert.equal(options.cache, "no-store");
      return Response.json({ status: "ok", database: "reachable", syntheticDataOnly: signals.synthetic });
    }
    if (url === "https://fbe-staging.syntavera.dev/") {
      assert.equal(options.cache, "no-store");
      return new Response(signals.marker ? "<p>NO APTO PARA PACIENTES</p>" : "<p>missing</p>",
        { status: signals.webStatus });
    }
    if (url.startsWith("https://login.microsoftonline.com/")) {
      return Response.json({ access_token: "synthetic-access-token" });
    }
    assert.equal(url, "https://graph.microsoft.com/v1.0/users/synthetic-alerts%40example.test/sendMail");
    const { message } = JSON.parse(options.body);
    assert.deepEqual(message.toRecipients, [{ emailAddress: { address: mailbox } }]);
    const eventId = options.headers["client-request-id"];
    assert.ok(message.subject.includes(eventId));
    deliveries.push({ eventId, subject: message.subject });
    if (signals.delivery === "lost") throw new Error("synthetic lost response");
    return new Response(null, { status: signals.delivery });
  }
  return { env, deliveries, signals, tick: (slot) => runPublicMonitor(env, start + slot * fiveMinutes, request) };
}

test("the external probe checks HTTPS health, synthetic mode and the web marker", async () => {
  const { signals, tick } = setup();
  assert.equal(worker.fetch().status, 404);
  assert.equal((await tick(0)).healthy, true);
  signals.synthetic = false;
  assert.equal((await tick(1)).healthy, false);
  signals.synthetic = true;
  signals.marker = false;
  assert.equal((await tick(2)).healthy, false);
  signals.marker = true;
  signals.webStatus = 503;
  assert.equal((await tick(3)).healthy, false);
  signals.webStatus = 302;
  assert.equal((await tick(4)).healthy, false);
  signals.webStatus = 200;
  assert.equal((await tick(5)).healthy, true);
});

test("the durable queue retains one event ID across rejection and ambiguous delivery", async () => {
  const { signals, deliveries, tick } = setup();
  signals.synthetic = false;
  assert.equal((await tick(0)).transition, null);
  signals.delivery = 429;
  const failure = await tick(1);
  assert.equal(failure.transition, "failed");
  assert.equal(failure.delivery, "retry");
  assert.equal((await tick(1)).duplicate, true);
  signals.synthetic = true;
  signals.delivery = "lost";
  assert.equal((await tick(2)).transition, "recovered");
  assert.equal((await tick(3)).delivery, "pending");
  assert.equal((await tick(4)).delivery, "pending");
  assert.equal(deliveries.length, 2);
  assert.equal((await tick(5)).delivery, "retry");
  assert.equal((await tick(16)).delivery, "pending");
  signals.delivery = 202;
  assert.equal((await tick(17)).delivery, "accepted");
  assert.equal((await tick(18)).delivery, "accepted");
  assert.equal((await tick(19)).delivery, "idle");
  assert.deepEqual(deliveries.slice(0, 4).map((entry) => entry.eventId), Array(4).fill(failure.eventId));
  assert.match(deliveries[4].subject, /Recuperación/);
  assert.notEqual(deliveries[4].eventId, failure.eventId);
});

test("an unconfigured transport retains transitions without sending", async () => {
  const { env, signals, deliveries, tick } = setup();
  delete env.FBE_GRAPH_CLIENT_SECRET;
  signals.synthetic = false;
  await tick(0);
  const queued = await tick(1);
  assert.equal(queued.delivery, "pending");
  assert.equal(deliveries.length, 0);
  env.FBE_GRAPH_CLIENT_SECRET = "synthetic";
  const released = await tick(2);
  assert.equal(released.delivery, "accepted");
  assert.equal(released.eventId, queued.eventId);
});
