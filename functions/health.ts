import { handle } from "hono/cloudflare-pages";
import { app } from "../backend/src/app";

// Health check: /health
export const onRequest = handle(app);
