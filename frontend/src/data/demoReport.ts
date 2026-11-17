import type { AuditReport } from "../types";

/**
 * Relatório de demonstração — permite visualizar toda a experiência de resultado
 * (score, severidades, failover e patches) sem depender do backend de IA.
 */
export const demoReport: AuditReport = {
  score: 62,
  summary:
    "A varredura identificou superfície de ataque relevante em rotas de API e no tratamento de segredos. " +
    "Há 2 falhas críticas que exigem correção imediata (execução de comando e exposição de credencial), " +
    "além de lacunas de configuração de CORS e headers de segurança. " +
    "As dependências apresentam versões desatualizadas com avisos conhecidos.",
  totalIssues: 7,
  criticalCount: 2,
  highCount: 2,
  mediumCount: 2,
  lowCount: 1,
  auditedFilesCount: 24,
  providerUsed: "Groq (Llama 3.3 70B)",
  modelUsed: "llama-3.3-70b-versatile",
  failoverOccurred: true,
  routingLogs: [
    {
      providerName: "Ollama Local (Offline)",
      endpoint: "http://localhost:11434/v1",
      model: "deepseek-coder:6.7b",
      status: "failed",
      durationMs: 612,
      error: "connect ECONNREFUSED 127.0.0.1:11434",
    },
    {
      providerName: "Groq (Llama 3.3 70B)",
      endpoint: "https://api.groq.com/openai/v1",
      model: "llama-3.3-70b-versatile",
      status: "success",
      durationMs: 1840,
    },
  ],
  timestamp: new Date().toISOString(),
  issues: [
    {
      id: "SEC-001",
      severity: "critical",
      title: "Execução de comando via entrada não sanitizada",
      category: "Injection",
      file: "backend/src/services/audit-sandbox.ts",
      line: 118,
      description:
        "A URL do repositório é interpolada diretamente em um comando de shell executado por execSync. " +
        "Apesar da remoção de alguns caracteres, o valor permanece controlável pelo usuário, permitindo " +
        "injeção de comandos (Command Injection) no host da sandbox.",
      recommendation:
        "Evite shells intermediários. Use execFile/spawn com um array de argumentos e valide a URL contra " +
        "uma allowlist de domínios (github.com, gitlab.com) antes da clonagem.",
      remediatedCodeSnippet: `import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const ALLOWED_HOSTS = ["github.com", "gitlab.com"];

export async function cloneGitRepo(repoUrl: string, targetDir: string) {
  const { hostname, protocol } = new URL(repoUrl);
  if (protocol !== "https:" || !ALLOWED_HOSTS.includes(hostname)) {
    throw new Error("Repositório não permitido.");
  }
  // Sem shell: argumentos são passados de forma segura.
  await run("git", ["clone", "--depth", "1", repoUrl, targetDir], { timeout: 30_000 });
}`,
    },
    {
      id: "SEC-002",
      severity: "critical",
      title: "Chave de API exposta no bundle do cliente",
      category: "Secrets Leak",
      file: "frontend/src/lib/api.ts",
      line: 4,
      description:
        "Uma chave de serviço é referenciada com prefixo VITE_, o que a embute no bundle JavaScript " +
        "entregue ao navegador. Qualquer visitante pode extraí-la do código-fonte público.",
      recommendation:
        "Remova segredos do frontend. Faça as chamadas privilegiadas a partir do backend/edge e mantenha " +
        "a credencial apenas em variáveis de ambiente do servidor.",
      remediatedCodeSnippet: `// ❌ Antes
const KEY = import.meta.env.VITE_AI_SERVICE_KEY;

// ✅ Depois — o cliente nunca vê o segredo.
// frontend/src/lib/api.ts
export async function audit(payload: AuditPayload) {
  const res = await fetch("/api/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Falha na auditoria");
  return res.json();
}`,
    },
    {
      id: "SEC-003",
      severity: "high",
      title: "CORS irrestrito com credenciais habilitadas",
      category: "Config / Insecure Deps",
      file: "backend/src/index.ts",
      line: 39,
      description:
        "O middleware de CORS responde com Access-Control-Allow-Origin: *, o que combinado com endpoints " +
        "autenticados amplia a superfície para abuso cross-origin.",
      recommendation:
        "Restrinja a origem a uma allowlist explícita e valide o cabeçalho Origin em cada requisição.",
      remediatedCodeSnippet: `const ALLOWED = ["https://app.sentinel.dev", "http://localhost:5173"];

app.use("/*", cors({
  origin: (origin) => (origin && ALLOWED.includes(origin) ? origin : ALLOWED[0]),
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
}));`,
    },
    {
      id: "SEC-004",
      severity: "high",
      title: "Ausência de cabeçalhos de segurança HTTP",
      category: "Config / Insecure Deps",
      file: "backend/src/index.ts",
      line: 27,
      description:
        "As respostas não definem Content-Security-Policy, X-Content-Type-Options nem Referrer-Policy, " +
        "facilitando sniffing de tipo MIME e execução de conteúdo não confiável.",
      recommendation:
        "Adicione um middleware de cabeçalhos de segurança (Hono secureHeaders) e uma CSP restritiva.",
      remediatedCodeSnippet: `import { secureHeaders } from "hono/secure-headers";

app.use("*", secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    imgSrc: ["'self'", "data:"],
    connectSrc: ["'self'", "https://api.groq.com"],
  },
  xContentTypeOptions: "nosniff",
  referrerPolicy: "strict-origin-when-cross-origin",
}));`,
    },
    {
      id: "SEC-005",
      severity: "medium",
      title: "Validação de entrada insuficiente no upload",
      category: "Code Quality",
      file: "backend/src/index.ts",
      line: 63,
      description:
        "A checagem de tipo do arquivo considera apenas a extensão .zip, sem validar assinatura (magic bytes) " +
        "nem o tamanho real antes de carregar todo o conteúdo em memória.",
      recommendation:
        "Valide a assinatura PK\\x03\\x04, imponha limite de tamanho via streaming e rejeite arquivos acima da cota.",
      remediatedCodeSnippet: `const MAX_BYTES = 25 * 1024 * 1024;
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

function isZip(buffer: Buffer) {
  return ZIP_MAGIC.every((b, i) => buffer[i] === b);
}

const buffer = Buffer.from(await file.arrayBuffer());
if (buffer.byteLength > MAX_BYTES) return c.json({ error: "Arquivo excede 25MB" }, 413);
if (!isZip(buffer)) return c.json({ error: "Assinatura ZIP inválida" }, 400);`,
    },
    {
      id: "SEC-006",
      severity: "medium",
      title: "Dependências com vulnerabilidades conhecidas",
      category: "Config / Insecure Deps",
      file: "package.json",
      line: 12,
      description:
        "Algumas dependências transitivas estão em faixas de versão que incluem avisos de segurança públicos " +
        "(prototype pollution e ReDoS em utilitários de parsing).",
      recommendation:
        "Fixe versões via overrides, rode npm audit fix e habilite Dependabot/Renovate no repositório.",
      remediatedCodeSnippet: `{
  "overrides": {
    "semver": "^7.6.3",
    "esbuild": "^0.25.0"
  },
  "scripts": {
    "audit": "npm audit --audit-level=high"
  }
}`,
    },
    {
      id: "SEC-007",
      severity: "low",
      title: "Logs com dados potencialmente sensíveis",
      category: "Code Quality",
      file: "backend/src/services/ai-client.ts",
      line: 214,
      description:
        "Erros de provedor são registrados com o corpo completo da requisição, que pode conter trechos de " +
        "código do cliente e metadados internos.",
      recommendation: "Redija o conteúdo antes de logar e limite a mensagens de erro a campos não sensíveis.",
      remediatedCodeSnippet: `catch (err) {
  console.warn("[AI] provider failed", {
    provider: provider.name,
    status: err?.status,
    // Nunca logue o corpo completo da requisição.
    message: String(err?.message ?? "unknown").slice(0, 160),
  });
}`,
    },
  ],
};
