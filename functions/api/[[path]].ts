import { handle } from "hono/cloudflare-pages";
import { app } from "../../backend/src/app";

// Catch-all da API: /api/audit/zip, /api/audit/url, etc.
export const onRequest = handle(app);
