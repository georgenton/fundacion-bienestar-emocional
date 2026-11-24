export type SessionResult<T> = { sessionKey: string; value: T };
export type SessionRequest = { sessionKey: string; signal: AbortSignal };

// The owner check is also used during render, before effect cleanup can run.
export function resultForSession<T>(result: SessionResult<T> | null, sessionKey: string | null): T | undefined {
  return sessionKey !== null && result?.sessionKey === sessionKey ? result.value : undefined;
}

export class SessionRequestGate {
  private active: { request: SessionRequest; controller: AbortController } | null = null;

  begin(sessionKey: string): SessionRequest {
    this.cancel();
    const controller = new AbortController();
    const request = { sessionKey, signal: controller.signal };
    this.active = { request, controller };
    return request;
  }

  isCurrent(request: SessionRequest): boolean {
    return this.active?.request === request && !request.signal.aborted;
  }

  cancel(): void {
    this.active?.controller.abort();
    this.active = null;
  }
}
