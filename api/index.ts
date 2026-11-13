import { app } from "../server/app";

// Entry point untuk Vercel Functions. Semua request /api/* diarahkan ke sini
// melalui vercel.json. Server lokal tetap memakai server/index.ts.
export default app;
