import { Hono } from "hono";
import { cors } from "hono/cors";
import * as dotenv from "dotenv";
import { AuditSandbox } from "./services/audit-sandbox";
import { AgnosticAIRouter } from "./services/ai-client";

// Carrega variáveis locais se estiver rodando em ambiente Node
// (o .env fica na raiz do monorepo, um nível acima de backend/)
dotenv.config();
dotenv.config({ path: "../.env" });

type Bindings = {
  AI_API_ENDPOINT?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
  AI_API_KEY_GROK?: string;
  AI_ENDPOINT_GROK?: string;
  AI_MODEL_GROK?: string;
  AI_API_KEY_GOOGLE?: string;
  AI_ENDPOINT_GOOGLE?: string;
  AI_MODEL_GOOGLE?: string;
  AI_API_KEY_OLLAMA?: string;
  AI_ENDPOINT_OLLAMA?: string;
  AI_MODEL_OLLAMA?: string;
  GROQ_API_KEY?: string;
  GROQ_ENDPOINT?: string;
  GROQ_MODEL?: string;
  OLLAMA_ENDPOINT?: string;
  OLLAMA_MODEL?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  AI_ROUTING_CHAIN?: string;
  ENVIRONMENT?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Configuração do CORS para comunicação com o frontend
app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

function getMergedEnv(c: any): Record<string, string | undefined> {
  const cloudflareEnv = c.env || {};
  const nodeEnv = typeof process !== "undefined" && process.env ? process.env : {};
  return { ...nodeEnv, ...cloudflareEnv };
}

// Health check detalhado informando o roteamento ativo de IA
app.get("/health", (c) => {
  const mergedEnv = getMergedEnv(c);

  try {
    const router = new AgnosticAIRouter(mergedEnv);
    const providers = router.getConfiguredProvidersInfo();

    return c.json({
      status: "ok",
      service: "Security Audit Orchestrator with AI Failover",
      providersCount: providers.length,
      primaryProvider: providers[0]?.name || "Nenhum",
      routingChain: providers,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return c.json({
      status: "warning",
      service: "Security Audit Orchestrator",
      warning: err.message,
      providersCount: 0,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Endpoint de Auditoria via Arquivo .ZIP
 */
app.post("/api/audit/zip", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body["file"];

    if (!file || !(file instanceof File)) {
      return c.json({ error: "Arquivo .zip obrigatório no campo 'file'." }, 400);
    }

    if (!file.name.endsWith(".zip")) {
      return c.json({ error: "Apenas arquivos com extensão .zip são permitidos." }, 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const runId = `audit-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const sandbox = new AuditSandbox();
    const result = await sandbox.executeAudit({
      runId,
      sourceType: "zip",
      zipBuffer: buffer,
      customEnv: getMergedEnv(c),
    });

    return c.json({ success: true, runId, ...result });
  } catch (error: any) {
    console.error("[API /audit/zip error]:", error);
    return c.json({ success: false, error: error.message || "Erro interno na execução da auditoria." }, 500);
  }
});

/**
 * Endpoint de Auditoria via link: repositório git OU arquivo .zip comum
 */
app.post("/api/audit/url", async (c) => {
  try {
    const { url } = await c.req.json<{ url: string }>();

    if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      return c.json(
        {
          error:
            "Link inválido. Use um endereço começando com http:// ou https:// " +
            "(ex.: https://github.com/usuario/projeto ou https://site.com/projeto.zip).",
        },
        400,
      );
    }

    const runId = `audit-url-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const sandbox = new AuditSandbox();

    // Link direto para um .zip → baixa e analisa como projeto compactado.
    // Caso contrário, tratamos como repositório git e clonamos.
    const isZipLink = /\.zip(\?|#|$)/i.test(url);
    const isGitHost =
      /(^|\.)(github\.com|gitlab\.com|bitbucket\.org|codeberg\.org|sr\.ht|gitea\.com)\b/i.test(url);

    const result =
      isZipLink || !isGitHost
        ? await sandbox.executeAudit({
            runId,
            sourceType: "zip",
            zipBuffer: await sandbox.downloadZip(url),
            customEnv: getMergedEnv(c),
          })
        : await sandbox.executeAudit({
            runId,
            sourceType: "git",
            repoUrl: url,
            customEnv: getMergedEnv(c),
          });

    return c.json({ success: true, runId, ...result });
  } catch (error: any) {
    console.error("[API /audit/url error]:", error);
    return c.json({ success: false, error: error.message || "Erro interno na execução da auditoria." }, 500);
  }
});

// Suporte para execução direta em Node.js (ex: npm run dev:node)
if (typeof process !== "undefined" && process.env?.PORT) {
  import("@hono/node-server").then(({ serve }) => {
    const port = Number(process.env.PORT) || 8787;
    console.log(`[Security Audit API] Servidor com Roteador de IA iniciado em http://localhost:${port}`);
    serve({ fetch: app.fetch, port });
  }).catch(() => {
    // Quando rodando dentro do runtime Workers do Cloudflare
  });
}

// Export compatível com Cloudflare Workers
export default app;
