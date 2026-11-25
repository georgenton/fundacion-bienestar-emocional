const stateKey = "public-state-v1";
const acceptedKey = "public-accepted-v1";
const interval = 5 * 60_000;
const retryDelays = [interval, 15 * 60_000, 60 * 60_000];
const guid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

async function publicHealthy(request) {
  try {
    const options = { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(10_000) };
    const [api, web] = await Promise.all([
      request("https://fbe-api-staging.syntavera.dev/health", options),
      request("https://fbe-staging.syntavera.dev/", options),
    ]);
    if (!api.ok || !web.ok) return false;
    const [health, page] = await Promise.all([api.json(), web.text()]);
    return health.status === "ok" && health.database === "reachable" &&
      health.syntheticDataOnly === true && page.includes("NO APTO PARA PACIENTES");
  } catch {
    return false;
  }
}

async function sendNotice(request, mail, notice) {
  try {
    const options = { method: "POST", redirect: "manual", signal: AbortSignal.timeout(10_000) };
    const tokenResponse = await request("https://login.microsoftonline.com/" + mail.tenant + "/oauth2/v2.0/token", {
      ...options,
      body: new URLSearchParams({
        client_id: mail.client, client_secret: mail.secret, grant_type: "client_credentials",
        scope: "https://graph.microsoft.com/.default",
      }),
    });
    if (!tokenResponse.ok) return false;
    const { access_token: token } = await tokenResponse.json();
    if (typeof token !== "string" || !token || /\s/.test(token)) return false;
    const transition = notice.status === "failed" ? "Fallo" : "Recuperación";
    const result = await request("https://graph.microsoft.com/v1.0/users/" + encodeURIComponent(mail.mailbox) + "/sendMail", {
      ...options,
      signal: AbortSignal.timeout(12_000),
      headers: {
        Authorization: "Bearer " + token, "Content-Type": "application/json",
        "client-request-id": notice.id,
      },
      body: JSON.stringify({
        message: {
          subject: "FBE staging | " + transition + " | HTTPS público | " + notice.id,
          body: { contentType: "Text", content: [
            "FBE staging sintético", transition + " · HTTPS público",
            "UTC " + new Date(notice.at).toISOString(), "ID " + notice.id,
          ].join("\n") },
          toRecipients: [{ emailAddress: { address: mail.mailbox } }],
        },
        saveToSentItems: true,
      }),
    });
    return result.status === 202;
  } catch {
    return false;
  }
}

export async function runPublicMonitor(env, scheduledTime, request = fetch) {
  const kv = env.FBE_PUBLIC_STATE;
  const slot = Math.floor(scheduledTime / interval);
  const [stored, accepted, healthy] = await Promise.all([
    kv.get(stateKey, "json"), kv.get(acceptedKey), publicHealthy(request),
  ]);
  const state = stored ?? { slot: -1, failures: 0, incident: false, outbox: [] };
  // KV can serve stale reads. This discards a replay when its slot is already visible.
  if (slot <= state.slot) return { slot, duplicate: true };
  state.slot = slot;
  if (state.outbox[0]?.id === accepted) state.outbox.shift();
  state.failures = healthy ? 0 : Math.min(2, state.failures + 1);
  const transition = healthy && state.incident ? "recovered" :
    state.failures === 2 && !state.incident ? "failed" : null;
  if (transition) {
    state.incident = transition === "failed";
    state.outbox.push({ id: crypto.randomUUID(), status: transition, at: scheduledTime, attempts: 0, next: scheduledTime });
  }
  const mail = {
    tenant: env.FBE_GRAPH_TENANT, client: env.FBE_GRAPH_CLIENT,
    mailbox: env.FBE_GRAPH_MAILBOX, secret: env.FBE_GRAPH_CLIENT_SECRET,
  };
  const configured = guid.test(mail.tenant) && guid.test(mail.client) &&
    /^[^\s<>@]+@[^\s<>@]+$/.test(mail.mailbox) && Boolean(mail.secret);
  const next = state.outbox[0];
  const attempt = configured && next && scheduledTime >= next.next;
  if (attempt) {
    next.next = scheduledTime + retryDelays[Math.min(next.attempts, retryDelays.length - 1)];
    next.attempts += 1;
  }
  // Write the intent and delay before sending. A separate key permits one write to
  // each key per tick, including a fast Graph response.
  await kv.put(stateKey, JSON.stringify(state));
  let delivery = next ? "pending" : "idle";
  if (attempt) {
    delivery = "retry";
    if (await sendNotice(request, mail, next)) {
      await kv.put(acceptedKey, next.id);
      delivery = "accepted";
    }
  }
  return { slot, healthy, transition, delivery, eventId: next?.id };
}

export default {
  fetch() {
    return new Response(null, { status: 404 });
  },
  async scheduled(controller, env) {
    const outcome = await runPublicMonitor(env, controller.scheduledTime);
    console.log("fbe_public_probe", outcome);
  },
};
