"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { apiBaseUrl } from "../../../lib/auth-client";
import { ApiError, explain } from "../../../lib/operations";
import type { Requester } from "../common";

export function useResource<T>(request: Requester, path: string) {
  const [value, setValue] = useState<T>();
  const [error, setError] = useState("");
  useEffect(() => {
    const signal = new AbortController();
    request<T>(path, undefined, signal.signal)
      .then(result => { if (!signal.signal.aborted) setValue(result); })
      .catch(error => { if (!signal.signal.aborted) setError(explain(error)); });
    return () => signal.abort();
  }, [path, request]);
  return {
    value, error,
    reload: async () => { setValue(await request<T>(path)); setError(""); },
  };
}

export function useAction(refresh?: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await refresh?.();
      setFailed(false);
      setMessage("Cambios guardados.");
    } catch (error) {
      setFailed(true);
      setMessage(explain(error));
    } finally {
      setBusy(false);
    }
  }
  return { busy, run, feedback: message && <p className="message" role={failed ? "alert" : "status"}>{message}</p> };
}

export function onForm(action: (data: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    action(new FormData(event.currentTarget));
  };
}

export function Loading({ error, children }: { error: string; children?: ReactNode }) {
  if (error) return <p className="message" role="alert">{error}</p>;
  return children ?? <p role="status">Cargando…</p>;
}

export function saveDownload(file: Blob, name: string) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadPrivate(id: string) {
  const response = await fetch(`${apiBaseUrl}/api/clinical/files/${id}`, { credentials: "include", cache: "no-store" });
  if (!response.ok) {
    const failure = await response.json();
    throw new ApiError(failure.code ?? "REQUEST_FAILED", response.status);
  }
  saveDownload(await response.blob(), "documento-sintetico.txt");
}
