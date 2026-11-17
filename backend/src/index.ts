import * as dotenv from "dotenv";
import { app } from "./app";

// Entrada para execução local em Node.js (ex.: npm run dev:node).
// No Cloudflare (Workers/Pages) o app é servido a partir de ./app via as Functions.
dotenv.config();
dotenv.config({ path: "../.env" });

const port = Number(process.env.PORT) || 8787;

import("@hono/node-server").then(({ serve }) => {
  console.log(`[Security Audit API] Servidor com Roteador de IA iniciado em http://localhost:${port}`);
  serve({ fetch: app.fetch, port });
});

export { app };
export default app;
