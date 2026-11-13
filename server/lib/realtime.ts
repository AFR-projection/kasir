import type { Response } from "express";

export type RealtimeEventType =
  | "product.created"
  | "product.updated"
  | "product.deleted"
  | "category.created"
  | "category.updated"
  | "category.deleted"
  | "stock.adjusted"
  | "transaction.created"
  | "cash-session.changed"
  | "cash-expense.changed"
  | "user.changed"
  | "settings.updated";

export interface RealtimeEvent {
  type: RealtimeEventType;
  at: string;
  data?: Record<string, unknown>;
}

interface Client {
  res: Response;
  userId: string;
}

const clients = new Set<Client>();
let heartbeat: NodeJS.Timeout | null = null;

function startHeartbeat(): void {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    for (const client of clients) {
      try {
        client.res.write(": ping\n\n");
      } catch {
        clients.delete(client);
      }
    }
  }, 25_000);
  heartbeat.unref?.();
}

export function subscribeToEvents(res: Response, userId: string): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write("retry: 3000\n\n");
  res.write(`data: ${JSON.stringify({ type: "connected", at: new Date().toISOString() })}\n\n`);

  const client: Client = { res, userId };
  clients.add(client);
  startHeartbeat();

  const cleanup = () => {
    clients.delete(client);
    if (clients.size === 0 && heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  res.on("close", cleanup);
  res.on("error", cleanup);
}

export function emitEvent(type: RealtimeEventType, data?: Record<string, unknown>): void {
  const event: RealtimeEvent = {
    type,
    at: new Date().toISOString(),
    ...(data ? { data } : {}),
  };
  const payload = `data: ${JSON.stringify(event)}\n\n`;

  for (const client of clients) {
    try {
      client.res.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

export function connectedClientCount(): number {
  return clients.size;
}

export function closeAllEventStreams(): void {
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
  for (const client of clients) {
    try {
      client.res.end();
    } catch {
      // Abaikan koneksi yang sudah tertutup.
    }
  }
  clients.clear();
}
