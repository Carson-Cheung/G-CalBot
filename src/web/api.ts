import type {
  AddCalendarPayload,
  AddCalendarResponse,
  AuthResponse,
  HealthResponse,
  SessionResponse,
  SettingsPayload,
  UserCalendarData,
} from './types';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: string;
  token?: string | null;
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;

  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON body (proxy error page, empty 204); handled via status below
  }

  const errorMessage =
    data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
      ? (data as { error: string }).error
      : null;

  if (!res.ok || errorMessage) {
    throw new ApiError(errorMessage || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

const userPath = (userId: string) => `/api/user/${encodeURIComponent(userId)}`;

export const api = {
  getHealth: (signal?: AbortSignal) => request<HealthResponse>('/api/health', { signal }),

  getConfig: () => request<{ clientId?: string }>('/api/config'),

  exchangeCode: (code: string) => request<AuthResponse>('/api/token', { method: 'POST', body: { code } }),

  redeemLoginLink: (code: string) =>
    request<{ sessionToken: string }>('/api/auth/link', { method: 'POST', body: { code } }),

  verifySession: (token: string) => request<SessionResponse>('/api/auth/session?initial=true', { token }),

  startDemoHandoff: () =>
    request<unknown>('/api/auth/activity-handoff', { method: 'POST', body: { isDemoLaunch: true } }).catch(
      () => undefined
    ),

  getCalendar: (userId: string, token: string | null, sync: boolean, signal?: AbortSignal) =>
    request<UserCalendarData>(`${userPath(userId)}/calendar${sync ? '?sync=true' : ''}`, { token, signal }),

  addCalendar: (userId: string, token: string | null, payload: AddCalendarPayload) =>
    request<AddCalendarResponse>(`${userPath(userId)}/calendar`, { method: 'POST', token, body: payload }),

  removeCalendar: (userId: string, token: string | null, calendarId: string) =>
    request<{ success?: boolean }>(`${userPath(userId)}/calendar/${encodeURIComponent(calendarId)}`, {
      method: 'DELETE',
      token,
    }),

  unlinkAll: (userId: string, token: string | null) =>
    request<{ success?: boolean }>(`${userPath(userId)}/calendar`, { method: 'DELETE', token }),

  saveSettings: (userId: string, token: string | null, payload: SettingsPayload) =>
    request<unknown>(`${userPath(userId)}/settings`, { method: 'PATCH', token, body: payload }),

  sendTestAlert: (userId: string, token: string | null) =>
    request<{ success?: boolean }>(`${userPath(userId)}/test`, { method: 'POST', token }),
};
