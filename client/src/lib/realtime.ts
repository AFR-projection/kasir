import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { RealtimeStatus } from "../components/ui";

type EventPayload = {
  type: string;
  at?: string;
  data?: Record<string, unknown>;
};

type RealtimeMode = "sse" | "polling";

const POLL_INTERVAL_MS = 12_000;

const eventInvalidationMap: Record<string, string[][]> = {
  "product.created": [["products"], ["categories"], ["dashboard"], ["stock-movements"]],
  "product.updated": [["products"], ["categories"], ["dashboard"], ["stock-movements"]],
  "product.deleted": [["products"], ["categories"], ["dashboard"], ["stock-movements"]],
  "category.created": [["categories"], ["products"], ["dashboard"]],
  "category.updated": [["categories"], ["products"], ["dashboard"]],
  "category.deleted": [["categories"], ["products"], ["dashboard"]],
  "stock.adjusted": [["products"], ["dashboard"], ["stock-movements"], ["categories"]],
  "transaction.created": [
    ["transactions"],
    ["transaction"],
    ["dashboard"],
    ["products"],
    ["stock-movements"],
    ["cash-session"],
  ],
  "cash-session.changed": [["cash-session"], ["transactions"], ["dashboard"]],
  "cash-expense.changed": [["expenses"], ["cash-session"], ["dashboard"], ["transactions"]],
  "user.changed": [["users"]],
  "settings.updated": [["settings"], ["auth", "me"]],
};

const allInvalidationKeys = Array.from(
  new Map(Object.values(eventInvalidationMap).flat().map((key) => [JSON.stringify(key), key])).values(),
);

let cachedRealtimeMode: RealtimeMode | null = null;
let realtimeModeRequest: Promise<RealtimeMode> | null = null;

async function detectRealtimeMode(): Promise<RealtimeMode> {
  if (cachedRealtimeMode) return cachedRealtimeMode;
  if (!realtimeModeRequest) {
    realtimeModeRequest = (async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 4_000);
      try {
        const response = await fetch("/api/health", {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) return "sse";
        const payload = (await response.json()) as { realtime?: string };
        return payload.realtime === "polling" ? "polling" : "sse";
      } catch {
        // Server lokal lama belum mengirim info realtime; coba SSE.
        return "sse";
      } finally {
        window.clearTimeout(timeout);
        realtimeModeRequest = null;
      }
    })();
  }

  cachedRealtimeMode = await realtimeModeRequest;
  return cachedRealtimeMode;
}

export function useRealtime(enabled = true): RealtimeStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("connecting");

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let source: EventSource | null = null;
    let reconnectTimeout: number | null = null;
    let pollingInterval: number | null = null;
    let retryCount = 0;

    const invalidateAll = () => {
      if (document.visibilityState === "hidden") return;
      for (const queryKey of allInvalidationKeys) {
        void queryClient.invalidateQueries({ queryKey });
      }
    };

    const startPolling = () => {
      if (disposed || pollingInterval !== null) return;
      setStatus("polling");
      pollingInterval = window.setInterval(invalidateAll, POLL_INTERVAL_MS);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (pollingInterval !== null) invalidateAll();
        else if (!source && !disposed) connect();
      }
    };

    const connect = () => {
      if (disposed) return;

      source = new EventSource("/api/events", { withCredentials: true });
      setStatus(retryCount > 0 ? "reconnecting" : "connecting");

      source.onopen = () => {
        retryCount = 0;
        setStatus("online");
      };

      source.onmessage = (message) => {
        let payload: EventPayload;
        try {
          payload = JSON.parse(message.data) as EventPayload;
        } catch {
          return;
        }
        if (!payload.type || payload.type === "connected") return;

        const keys = eventInvalidationMap[payload.type];
        if (!keys) return;
        for (const queryKey of keys) {
          void queryClient.invalidateQueries({ queryKey });
        }
      };

      source.onerror = () => {
        if (disposed) return;
        const readyState = source?.readyState;
        source?.close();
        source = null;

        retryCount += 1;
        // Di serverless (Vercel), SSE bisa gagal berulang. Setelah beberapa
        // percobaan, beralih ke polling agar data tetap tersinkron.
        if (retryCount >= 3) {
          setStatus("reconnecting");
          startPolling();
          return;
        }

        setStatus("reconnecting");
        if (readyState === EventSource.CLOSED || readyState === EventSource.CONNECTING) {
          const delay = Math.min(10_000, 1_000 * Math.max(1, retryCount));
          reconnectTimeout = window.setTimeout(connect, delay);
        }
      };
    };

    void detectRealtimeMode().then((mode) => {
      if (disposed) return;
      if (mode === "polling") {
        startPolling();
      } else {
        connect();
      }
    });

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      source?.close();
      if (reconnectTimeout) window.clearTimeout(reconnectTimeout);
      if (pollingInterval) window.clearInterval(pollingInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, queryClient]);

  return status;
}
