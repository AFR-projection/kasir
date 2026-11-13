import { Router } from "express";
import { config } from "../config";
import { requireAuth } from "../lib/auth";
import { asyncHandler } from "../lib/http";
import { subscribeToEvents } from "../lib/realtime";

export const eventsRouter = Router();

eventsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) return;

    if (!config.sseEnabled) {
      res.status(503).json({
        message: "Realtime SSE tidak tersedia pada deployment ini. Klien menggunakan polling.",
        code: "SSE_UNAVAILABLE",
        realtime: config.realtimeMode,
      });
      return;
    }

    subscribeToEvents(res, req.user.id);
    req.on("close", () => {
      res.end();
    });
  }),
);
