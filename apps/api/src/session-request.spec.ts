import { describe, expect, it } from "vitest";
import { resultForSession, SessionRequestGate, type SessionResult } from "../../web/src/lib/session-request.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("session-bound case results", () => {
  it("hides the prior session's results immediately, before asynchronous cleanup", () => {
    const result = { sessionKey: "reception:session-a", value: ["case-a", "case-b"] };
    expect(resultForSession(result, "reception:session-a")).toEqual(["case-a", "case-b"]);
    expect(resultForSession(result, null)).toBeUndefined();
    expect(resultForSession(result, "patient:session-b")).toBeUndefined();
    expect(resultForSession(result, "reception:session-c")).toBeUndefined();
  });

  it("discards a prior user's late response even if a transport ignores abort", async () => {
    const gate = new SessionRequestGate();
    let result: SessionResult<string[]> | null = null;
    const oldResponse = deferred<string[]>();
    const oldRequest = gate.begin("reception:session-a");
    const oldCompletion = oldResponse.promise.then((value) => {
      if (gate.isCurrent(oldRequest)) result = { sessionKey: oldRequest.sessionKey, value };
    });
    gate.cancel(); // Logout, then login as a patient in the same mounted page.
    expect(oldRequest.signal.aborted).toBe(true);
    const patientRequest = gate.begin("patient:session-b");
    if (gate.isCurrent(patientRequest)) result = { sessionKey: patientRequest.sessionKey, value: ["case-a"] };
    oldResponse.resolve(["case-a", "case-b"]);
    await oldCompletion;
    expect(resultForSession(result, "patient:session-b")).toEqual(["case-a"]);
  });

  it("prevents an earlier request in the same session from overwriting a newer result", async () => {
    const gate = new SessionRequestGate();
    const olderResponse = deferred<string[]>();
    const oldRequest = gate.begin("professional:session-a");
    let result: SessionResult<string[]> | null = null;
    const oldCompletion = olderResponse.promise.then((value) => {
      if (gate.isCurrent(oldRequest)) result = { sessionKey: oldRequest.sessionKey, value };
    });
    const currentRequest = gate.begin("professional:session-a");
    if (gate.isCurrent(currentRequest)) result = { sessionKey: currentRequest.sessionKey, value: [] };
    olderResponse.resolve(["revoked-case"]);
    await oldCompletion;
    expect(resultForSession(result, "professional:session-a")).toEqual([]);
  });
});
