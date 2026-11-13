import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { put } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { config } from "../config";
import { requireOwner } from "../lib/auth";
import { AppError, asyncHandler } from "../lib/http";

const allowedMimeTypes: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

// Buffer di memori agar kompatibel dengan Vercel (filesystem read-only).
// Penyimpanan lokal hanya dipakai saat pengembangan/self-host.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes[file.mimetype]) {
      callback(new AppError(400, "Format gambar harus JPG, PNG, atau WEBP."));
      return;
    }
    callback(null, true);
  },
});

const maxUploadBytes = 5 * 1024 * 1024;

export const uploadRouter = Router();
uploadRouter.use(requireOwner);

uploadRouter.get("/config", (_req, res) => {
  const mode = config.blobReadWriteToken ? "blob" : config.isVercel ? "unavailable" : "local";
  res.json({ mode, maxSize: maxUploadBytes });
});

// Upload langsung dari browser ke Vercel Blob. Ini menghindari batas body
// 4,5 MB pada Vercel Functions dan tidak memproses multipart di server.
uploadRouter.post(
  "/blob",
  asyncHandler(async (req, res) => {
    if (!config.blobReadWriteToken) {
      throw new AppError(
        503,
        "Penyimpanan gambar belum dikonfigurasi. Hubungkan Vercel Blob ke project (BLOB_READ_WRITE_TOKEN).",
        { code: "UPLOAD_STORAGE_UNAVAILABLE" },
      );
    }

    const result = await handleUpload({
      body: req.body as HandleUploadBody,
      request: req,
      token: config.blobReadWriteToken,
      onBeforeGenerateToken: async (pathname) => {
        if (!/^products\/[a-zA-Z0-9_-]{1,100}\.(jpg|jpeg|png|webp)$/.test(pathname)) {
          throw new AppError(400, "Nama file gambar tidak valid.", { code: "INVALID_UPLOAD_PATH" });
        }
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
          maximumSizeInBytes: maxUploadBytes,
          addRandomSuffix: false,
          allowOverwrite: false,
        };
      },
    });

    res.status(200).json(result);
  }),
);

uploadRouter.post(
  "/product-image",
  upload.single("image"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError(400, "Pilih file gambar terlebih dahulu.");
    }

    const extension = allowedMimeTypes[req.file.mimetype] || ".jpg";
    const filename = `${crypto.randomUUID()}${extension}`;

    if (config.blobReadWriteToken) {
      const blob = await put(`products/${filename}`, req.file.buffer, {
        access: "public",
        contentType: req.file.mimetype,
        token: config.blobReadWriteToken,
        addRandomSuffix: false,
      });

      res.status(201).json({
        url: blob.url,
        filename,
        size: req.file.size,
      });
      return;
    }

    if (config.isVercel) {
      throw new AppError(
        503,
        "Penyimpanan gambar belum dikonfigurasi. Hubungkan Vercel Blob ke project (BLOB_READ_WRITE_TOKEN).",
        { code: "UPLOAD_STORAGE_UNAVAILABLE" },
      );
    }

    await fs.mkdir(config.uploadDir, { recursive: true });
    await fs.writeFile(path.join(config.uploadDir, filename), req.file.buffer);

    res.status(201).json({
      url: `/uploads/${filename}`,
      filename,
      size: req.file.size,
    });
  }),
);

// Referensi path dipakai oleh app.ts untuk static serving pada mode lokal.
export const uploadsDirectory = config.uploadDir;
export const uploadsMountPath = path.posix.sep + "uploads";
