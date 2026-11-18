import { Hono } from "hono";
import { cors } from "hono/cors";
import { AuditSandbox } from "./services/audit-sandbox";
import { AgnosticAIRouter } from "./services/ai-client";

export type Bindings = {
  AI_API_ENDPOINT?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
  AI_API_KEY_GOOGLE?: string;
  AI_ENDPOINT_GOOGLE?: string;
  AI_MODEL_GOOGLE?: string;
  AI_API_KEY_OLLAMA?: string;
  AI_ENDPOINT_OLLAMA?: string;
  AI_MODEL_OLLAMA?: string;
  AI_API_KEY_NVIDIA?: string;
  AI_ENDPOINT_NVIDIA?: string;
  AI_MODEL_NVIDIA?: string;
  NVIDIA_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_ENDPOINT?: string;
  OPENROUTER_MODEL?: string;
  GROQ_API_KEY?: string;
  GROQ_ENDPOINT?: string;
  GROQ_MODEL?: string;
  OLLAMA_ENDPOINT?: string;
  OLLAMA_MODEL?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
  AI_ROUTING_CHAIN?: string;
  ENVIRONMENT?: string;
};

export const app = new Hono<{ Bindings: Bindings }>();

/** Limite de upload (bytes) — protege a memória do runtime contra arquivos enormes. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

// CORS — necessário apenas para o desenvolvimento local (frontend em outra porta).
app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
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
 * Endpoint de Auditoria via Arquivo .ZIP (ou pasta compactada no navegador)
 */
app.post("/api/audit/zip", async (c) => {
  try {
    // Guarda de tamanho: evita esgotar a memória do runtime com uploads enormes.
    const contentLength = Number(c.req.header("content-length") || 0);
    if (contentLength > MAX_UPLOAD_BYTES) {
      return c.json(
        { error: "O projeto enviado é grande demais. Envie apenas a pasta principal." },
        413,
      );
    }

    const body = await c.req.parseBody();
    const file = body["file"];

    if (!file || !(file instanceof File)) {
      return c.json({ error: "Arquivo .zip obrigatório no campo 'file'." }, 400);
    }

    if (!file.name.toLowerCase().endsWith(".zip")) {
      return c.json({ error: "Apenas arquivos com extensão .zip são permitidos." }, 400);
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return c.json(
        { error: "O projeto enviado é grande demais. Envie apenas a pasta principal." },
        413,
      );
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
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
 * Endpoint de Auditoria via link: site publicado, repositório git OU arquivo .zip
 */
app.post("/api/audit/url", async (c) => {
  try {
    const { url } = await c.req.json<{ url: string }>();

    if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      return c.json(
        {
          error:
            "Link inválido. Use um endereço começando com http:// ou https:// " +
            "(ex.: https://seusite.com, https://github.com/usuario/projeto ou https://site.com/projeto.zip).",
        },
        400,
      );
    }

    const runId = `audit-url-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const sandbox = new AuditSandbox();

    // Três formatos de link:
    //  - termina em .zip           → baixa e analisa como projeto compactado;
    //  - host de repositório git   → baixa o código-fonte do repositório;
    //  - qualquer outro endereço   → lê o site publicado e analisa a página no ar.
    const isZipLink = /\.zip(\?|#|$)/i.test(url);
    const isGitHost =
      /(?:^|[./@])(github\.com|gitlab\.com|bitbucket\.org|codeberg\.org|sr\.ht|gitea\.com)\b/i.test(
        url,
      ) || /\.git(\?|#|$)/i.test(url);

    const result = isZipLink
      ? await sandbox.executeAudit({
          runId,
          sourceType: "zip",
          zipBuffer: await sandbox.downloadZip(url),
          customEnv: getMergedEnv(c),
        })
      : isGitHost
        ? await sandbox.executeAudit({
            runId,
            sourceType: "git",
            repoUrl: url,
            customEnv: getMergedEnv(c),
          })
        : await sandbox.executeAudit({
            runId,
            sourceType: "site",
            siteUrl: url,
            customEnv: getMergedEnv(c),
          });

    return c.json({ success: true, runId, ...result });
  } catch (error: any) {
    console.error("[API /audit/url error]:", error);
    return c.json({ success: false, error: error.message || "Erro interno na execução da auditoria." }, 500);
  }
});

export default app;
