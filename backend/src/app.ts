import { Hono } from "hono";
import { cors } from "hono/cors";
import { AuditSandbox } from "./services/audit-sandbox";
import { AgnosticAIRouter } from "./services/ai-client";

export type Bindings = {
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

export const app = new Hono<{ Bindings: Bindings }>();

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
    const body = await c.req.parseBody();
    const file = body["file"];

    if (!file || !(file instanceof File)) {
      return c.json({ error: "Arquivo .zip obrigatório no campo 'file'." }, 400);
    }

    if (!file.name.toLowerCase().endsWith(".zip")) {
      return c.json({ error: "Apenas arquivos com extensão .zip são permitidos." }, 400);
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
    // Caso contrário, tratamos como repositório git e baixamos o arquivo do host.
    const isZipLink = /\.zip(\?|#|$)/i.test(url);
    const isGitHost =
      /(?:^|[./@])(github\.com|gitlab\.com|bitbucket\.org|codeberg\.org|sr\.ht|gitea\.com)\b/i.test(
        url,
      ) || /\.git(\?|#|$)/i.test(url);

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

// --- DIAGNÓSTICO TEMPORÁRIO: testa de verdade quais modelos respondem ---
app.get("/api/_models", async (c) => {
  const env = getMergedEnv(c);
  const base = (env.AI_ENDPOINT_GOOGLE || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/$/, "");
  const key = env.AI_API_KEY_GOOGLE;
  if (!key) return c.json({ google: "sem chave" });

  const candidates = [
    "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-3.7-flash",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-2.5-flash-lite",
    "gemini-3.8-flash",
  ];

  const out: Record<string, unknown> = {};
  await Promise.all(
    candidates.map(async (model) => {
      const t0 = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      try {
        const r = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "Responda apenas: ok" }],
            max_tokens: 5,
          }),
        });
        const text = await r.text();
        out[model] = {
          status: r.status,
          ms: Date.now() - t0,
          body: r.ok ? "OK: " + text.slice(0, 120) : text.slice(0, 160),
        };
      } catch (e: any) {
        out[model] = { status: "erro", ms: Date.now() - t0, body: e.message };
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  return c.json(out);
});

export default app;
