import type { AuditReport } from "../types";

/**
 * Relatório de demonstração — permite visualizar toda a experiência de resultado
 * (score, severidades, failover e patches) sem depender do backend de IA.
 */
export const demoReport: AuditReport = {
  score: 62,
  summary:
    "Analisamos 24 arquivos do seu projeto e encontramos 7 pontos que precisam de atenção. " +
    "Dois deles são graves e pedem correção o quanto antes, porque podem ser usados por um invasor " +
    "para rodar comandos no seu servidor ou roubar uma chave de acesso. " +
    "Os demais são ajustes de configuração, bibliotecas desatualizadas e cuidados com o que fica " +
    "registrado nos logs. Nada disso é difícil de resolver — é só seguir as correções sugeridas em cada item.",
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
      title: "Alguém pode executar comandos no seu servidor",
      category: "Injection",
      file: "backend/src/services/audit-sandbox.ts",
      line: 118,
      description:
        "O sistema pega o link do repositório que você envia e usa esse texto para montar um comando do " +
        "sistema operacional. Como esse texto vem de fora, uma pessoa mal-intencionada pode inserir " +
        "instruções extras e fazer o servidor executar comandos que não deveria.",
      recommendation:
        "Não monte comandos juntando textos. Passe o link como um valor separado e, antes de usá-lo, " +
        "confira se ele realmente veio de um site confiável (como github.com ou gitlab.com).",
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
      title: "Chave de acesso secreta exposta no site",
      category: "Secrets Leak",
      file: "frontend/src/lib/api.ts",
      line: 4,
      description:
        "Uma chave de acesso foi colocada de um jeito que faz ela ir junto com o site para o navegador de " +
        "qualquer visitante. Na prática, qualquer pessoa consegue copiar essa chave e usá-la como se fosse você.",
      recommendation:
        "Nunca coloque chaves secretas no lado do site (o que abre no navegador). Deixe essa chave apenas " +
        "no servidor, onde ninguém de fora consegue vê-la.",
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
      title: "Seu servidor aceita pedidos de qualquer lugar",
      category: "Config / Insecure Deps",
      file: "backend/src/index.ts",
      line: 39,
      description:
        "O servidor está configurado para aceitar pedidos vindos de qualquer site, inclusive de páginas " +
        "maliciosas. Isso abre espaço para alguém usar a sua aplicação fingindo ser outra pessoa.",
      recommendation:
        "Limite a lista de sites autorizados a conversar com o seu servidor e aceite apenas os que você conhece.",
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
      title: "Faltam proteções básicas nas respostas do site",
      category: "Config / Insecure Deps",
      file: "backend/src/index.ts",
      line: 27,
      description:
        "O servidor não envia alguns avisos de segurança que os navegadores esperam receber. Sem eles, " +
        "fica mais fácil para um invasor enganar o navegador e carregar conteúdo perigoso para o visitante.",
      recommendation:
        "Ligue essas proteções nas respostas do servidor e defina uma regra dizendo de onde o conteúdo " +
        "pode ser carregado.",
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
      title: "O envio de arquivos confia demais no que recebe",
      category: "Code Quality",
      file: "backend/src/index.ts",
      line: 63,
      description:
        "O sistema só olha o final do nome do arquivo (.zip) para decidir se ele é válido. Dá para enviar " +
        "um arquivo disfarçado, e o sistema não confere o tamanho antes de carregar tudo para a memória.",
      recommendation:
        "Confira de verdade se o arquivo é mesmo um .zip (pelos primeiros bytes dele) e recuse arquivos " +
        "grandes demais antes de abrir.",
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
      title: "Peças do seu projeto estão desatualizadas",
      category: "Config / Insecure Deps",
      file: "package.json",
      line: 12,
      description:
        "Algumas bibliotecas que o seu projeto usa estão em versões antigas com falhas de segurança já " +
        "conhecidas publicamente. Isso é como manter uma porta com uma fechadura que já se sabe como abrir.",
      recommendation:
        "Atualize essas bibliotecas para versões corrigidas e ative um aviso automático que te alerte " +
        "quando surgir uma atualização com correções.",
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
      title: "Os registros do sistema podem guardar informação sensível",
      category: "Code Quality",
      file: "backend/src/services/ai-client.ts",
      line: 214,
      description:
        "Quando algo dá errado, o sistema salva no registro (log) o conteúdo completo da conversa com a " +
        "inteligência artificial — o que pode incluir trechos do seu código e informações internas.",
      recommendation:
        "Antes de salvar, esconda os dados sensíveis e guarde apenas o necessário para entender o que deu errado.",
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
