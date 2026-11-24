import { describe, expect, it } from "vitest";
import { assertCookieMutationOrigin } from "./mutation-origin.js";

describe("cookie-authenticated mutation origins", () => {
  const webOrigin = "https://app.foundation.example";
  const cookie = "fbe.session_token=synthetic";

  it("accepts the exact application origin for a cookie mutation", () => {
    expect(() => assertCookieMutationOrigin({ method: "POST", headers: { cookie, origin: webOrigin } }, webOrigin))
      .not.toThrow();
  });

  it("rejects a same-site sibling, a foreign origin and a deceptive prefix", () => {
    for (const origin of [
      "https://other.foundation.example",
      "https://foreign.example",
      "https://app.foundation.example.foreign.example",
    ]) {
      expect(() => assertCookieMutationOrigin({ method: "POST", headers: { cookie, origin } }, webOrigin))
        .toThrow(expect.objectContaining({ response: { code: "REQUEST_ORIGIN_NOT_ALLOWED" } }));
    }
  });

  it("rejects absent or null origins rather than trusting cookie-only scripts", () => {
    expect(() => assertCookieMutationOrigin({ method: "POST", headers: { cookie } }, webOrigin)).toThrow();
    expect(() => assertCookieMutationOrigin({ method: "DELETE", headers: { cookie, origin: "null" } }, webOrigin))
      .toThrow();
  });

  it("leaves reads, preflight and requests without cookies to their existing authentication rules", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(() => assertCookieMutationOrigin({ method, headers: { cookie } }, webOrigin)).not.toThrow();
    }
    expect(() => assertCookieMutationOrigin({ method: "POST", headers: {} }, webOrigin)).not.toThrow();
  });
});
