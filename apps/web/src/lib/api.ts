import axios from "axios";

// Same token model as HRMS: the access token lives in memory only; the refresh token is an
// httpOnly cookie on /api/auth. On load (and on a 401) the app trades the cookie for a new
// access token.

export const api = axios.create({ baseURL: "/api", withCredentials: true });

let _accessToken: string | null = null;
const tokenListeners = new Set<(token: string | null) => void>();

export function setAccessToken(token: string | null) {
  _accessToken = token;
  tokenListeners.forEach((l) => l(token));
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export function subscribeAccessToken(listener: (token: string | null) => void): () => void {
  tokenListeners.add(listener);
  return () => tokenListeners.delete(listener);
}

let refreshPromise: Promise<string | null> | null = null;

export function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = api
      .post<{ accessToken: string }>("/auth/refresh")
      .then(({ data }) => {
        setAccessToken(data.accessToken);
        return data.accessToken;
      })
      .catch(() => {
        setAccessToken(null);
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.request.use((config) => {
  if (_accessToken) config.headers["Authorization"] = `Bearer ${_accessToken}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config as typeof error.config & { _retry?: boolean };
    const isAuthCall = typeof original?.url === "string" && original.url.startsWith("/auth/");
    if (error.response?.status === 401 && original && !original._retry && !isAuthCall) {
      original._retry = true;
      const token = await refreshAccessToken();
      if (token) {
        original.headers["Authorization"] = `Bearer ${token}`;
        return api(original);
      }
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

/** The server's message for a failed request (validation issues joined), or a fallback. */
export function errMsg(e: unknown, fallback = "Something went wrong. Please try again."): string {
  const data = (e as { response?: { data?: { error?: string; issues?: { message?: string; path?: (string | number)[] }[] } } })?.response?.data;
  if (data?.issues?.length) {
    return data.issues.map((i) => (i.path?.length ? `${i.path.join(".")}: ${i.message}` : i.message)).filter(Boolean).join("; ");
  }
  return data?.error ?? fallback;
}

/** The workflow gate's full list of blockers, when the server sent them. */
export function errBlockers(e: unknown): string[] {
  const details = (e as { response?: { data?: { details?: { blockers?: string[] } } } })?.response?.data?.details;
  return details?.blockers ?? [];
}
