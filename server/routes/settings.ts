import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { currentUser, requireOwner } from "../lib/auth";
import { asyncHandler } from "../lib/http";
import { emitEvent } from "../lib/realtime";
import { scaleRoundingOptions } from "../lib/rounding";
import { getStore } from "../lib/store";
import { mapStore, type StoreRow } from "../lib/serializers";
import { optionalTrimmedString, trimmedString } from "../lib/validation";

export const settingsRouter = Router();

settingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    currentUser(req);
    res.json({ store: await getStore() });
  }),
);

settingsRouter.put(
  "/",
  requireOwner,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        storeName: trimmedString(2, 120, "Nama toko"),
        storeAddress: optionalTrimmedString(500, "Alamat"),
        storePhone: optionalTrimmedString(50, "Nomor telepon"),
        receiptFooter: optionalTrimmedString(300, "Footer struk"),
        scaleRounding: z
          .coerce.number()
          .int("Pembulatan timbangan tidak valid.")
          .refine(
            (value) => (scaleRoundingOptions as readonly number[]).includes(value),
            "Pembulatan timbangan harus 0, 100, 500, atau 1.000 rupiah.",
          )
          .optional(),
      })
      .parse(req.body);

    const result = await pool.query<StoreRow>(
      `UPDATE store_settings
       SET store_name = $1, store_address = $2, store_phone = $3, receipt_footer = $4,
           scale_rounding = COALESCE($5, scale_rounding)
       WHERE id = 1
       RETURNING store_name, store_address, store_phone, receipt_footer, scale_rounding`,
      [
        body.storeName,
        body.storeAddress,
        body.storePhone,
        body.receiptFooter,
        body.scaleRounding ?? null,
      ],
    );

    emitEvent("settings.updated");
    res.json({ store: mapStore(result.rows[0]), message: "Pengaturan toko disimpan." });
  }),
);
