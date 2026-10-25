"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401 && typeof window !== "undefined" && window.location.pathname.startsWith("/app")) {
    // Session expired: a full reload clears all client state before signing in again.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export async function apiGet<T>(url: string) {
  return handle<T>(await fetch(url, { cache: "no-store" }));
}

export async function apiSend<T>(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) {
  const init: RequestInit = { method };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  return handle<T>(await fetch(url, init));
}

/** Fetches JSON from an API route; `reload` re-runs it after a mutation. Keeps the last data while refetching. */
export function useApi<T>(url: string | null) {
  const [tick, setTick] = useState(0);
  const key = url ? `${url}#${tick}` : null;
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null }>({ key: null, data: null, error: null });

  useEffect(() => {
    if (!url || !key) return;
    let cancelled = false;
    apiGet<T>(url)
      .then((data) => !cancelled && setState({ key, data, error: null }))
      .catch((e: Error) => !cancelled && setState((s) => ({ key, data: s.data, error: e.message })));
    return () => {
      cancelled = true;
    };
  }, [url, key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((data: T) => setState((s) => ({ ...s, data })), []);
  return { data: state.data, error: state.error, loading: state.key !== key, reload, setData };
}

const noopSubscribe = () => () => {};

/** Reads a query-string value on the client (null during prerender), without needing a Suspense boundary. */
export function useQueryParam(name: string) {
  return useSyncExternalStore(
    noopSubscribe,
    () => new URLSearchParams(window.location.search).get(name),
    () => null,
  );
}
