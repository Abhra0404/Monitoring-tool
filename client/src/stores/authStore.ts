/**
 * Authentication store — token lifecycle + login/logout/refresh actions.
 *
 * Tokens are persisted to localStorage so the session survives refreshes.
 * The axios interceptor in services/api.ts attaches the access token and
 * transparently calls refresh() on 401 responses.
 */

import { create } from "zustand";

export interface AuthUser {
  id: string;
  email: string;
  role: "admin" | "user";
  apiKey: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  status: "idle" | "authenticated" | "loading";

  setTokens: (user: AuthUser, accessToken: string, refreshToken: string) => void;
  clear: () => void;
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
}

const ACCESS_KEY = "theoria.accessToken";
const REFRESH_KEY = "theoria.refreshToken";
const USER_KEY = "theoria.user";

function readUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

const initialAccess = typeof localStorage !== "undefined" ? localStorage.getItem(ACCESS_KEY) : null;
const initialRefresh = typeof localStorage !== "undefined" ? localStorage.getItem(REFRESH_KEY) : null;
const initialUser = typeof localStorage !== "undefined" ? readUser() : null;

const useAuthStore = create<AuthState>((set, get) => ({
  user: initialUser,
  accessToken: initialAccess,
  refreshToken: initialRefresh,
  status: initialAccess && initialUser ? "authenticated" : "idle",

  setTokens(user, accessToken, refreshToken) {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ user, accessToken, refreshToken, status: "authenticated" });
  },

  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    set({ user: null, accessToken: null, refreshToken: null, status: "idle" });
  },

  getAccessToken: () => get().accessToken,
  getRefreshToken: () => get().refreshToken,
}));

export default useAuthStore;
