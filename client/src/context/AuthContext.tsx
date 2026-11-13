import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { api } from "../lib/api";
import type { SessionUser, Store } from "../types";

interface AuthContextValue {
  user: SessionUser | null;
  store: Store;
  isLoading: boolean;
  refreshAuth: () => Promise<SessionUser | null>;
  logout: () => Promise<void>;
}

const defaultStore: Store = {
  storeName: "Toko Saya",
  storeAddress: null,
  storePhone: null,
  receiptFooter: "Terima kasih telah berbelanja.",
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: api.auth.me,
    staleTime: 30_000,
    retry: false,
  });

  const clearAuthenticatedState = useCallback(() => {
    queryClient.setQueryData(
      ["auth", "me"],
      (previous: { user: SessionUser | null; store: Store } | undefined) => ({
        user: null,
        store: previous?.store || defaultStore,
      }),
    );
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== "auth",
    });
  }, [queryClient]);

  useEffect(() => {
    const handleUnauthorized = () => clearAuthenticatedState();
    window.addEventListener("kasir:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("kasir:unauthorized", handleUnauthorized);
  }, [clearAuthenticatedState]);

  const refreshAuth = useCallback(async () => {
    const data = await queryClient.fetchQuery({
      queryKey: ["auth", "me"],
      queryFn: api.auth.me,
      staleTime: 0,
    });
    return data.user;
  }, [queryClient]);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // Tetap bersihkan sesi lokal walaupun jaringan sedang bermasalah.
    }
    clearAuthenticatedState();
  }, [clearAuthenticatedState]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: meQuery.data?.user ?? null,
      store: meQuery.data?.store ?? defaultStore,
      isLoading: meQuery.isLoading,
      refreshAuth,
      logout,
    }),
    [meQuery.data?.user, meQuery.data?.store, meQuery.isLoading, refreshAuth, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth harus dipakai di dalam AuthProvider.");
  return context;
}
