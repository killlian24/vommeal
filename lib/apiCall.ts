// Client helper for JSON API calls. Never throws: network failures and
// server errors come back as { ok: false } with a German text for a toast,
// so callers can always roll back and reset their busy state.

export const NETWORK_ERROR = 'Keine Verbindung'

export type ApiErrorBody = { error?: string; [key: string]: unknown }

export type ApiResult<T> =
  | { ok: true; status: number; data: T; error: '' }
  | { ok: false; status: number; data: ApiErrorBody | null; error: string }

type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Sent as JSON. */
  body?: unknown
  /** Text for server errors (status 0 always means "Keine Verbindung"). */
  fallback?: string
}

export async function apiCall<T = unknown>(url: string, opts: ApiOptions = {}): Promise<ApiResult<T>> {
  const { method = 'GET', body, fallback = 'Hat nicht geklappt' } = opts
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    return { ok: false, status: 0, data: null, error: NETWORK_ERROR }
  }
  const data = await res.json().catch(() => null)
  if (res.ok) return { ok: true, status: res.status, data: data as T, error: '' }
  const errorBody = data && typeof data === 'object' ? data as ApiErrorBody : null
  return { ok: false, status: res.status, data: errorBody, error: fallback }
}
