import { unzipSync } from "fflate";
import { AgnosticAIRouter, AuditReportResult } from "./ai-client";

export interface SandboxExecutionOptions {
  runId: string;
  sourceType: "zip" | "git";
  zipBuffer?: Uint8Array;
  repoUrl?: string;
  customEnv?: Record<string, string | undefined>;
}

/** Pastas que só pesam e não interessam à análise. */
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "coverage",
  ".cache",
  ".turbo",
  ".venv",
  "venv",
  "__pycache__",
  "target",
  "vendor",
  ".agents",
]);

/** Extensões de arquivos que valem a pena auditar. */
const ALLOWED_EXTENSIONS = new Set([
  ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts",
  ".py", ".go", ".rs", ".php", ".rb", ".java", ".kt", ".cs", ".swift",
  ".json", ".yaml", ".yml", ".toml", ".ini", ".env.example", ".sql", ".sh",
  ".html", ".vue", ".svelte", ".dockerfile",
]);

const MAX_FILES = 30;
const MAX_FILE_BYTES = 300_000;
const MAX_ARCHIVE_BYTES = 60 * 1024 * 1024; // 60 MB

/**
 * Sandbox de auditoria 100% em memória — funciona tanto em Node.js quanto no
 * runtime Workers/Pages do Cloudflare (sem git, sem npx e sem disco).
 */
export class AuditSandbox {
  /**
   * Orquestra a execução completa:
   * 1. Obtém o código do cliente (.zip enviado, link .zip ou repositório git)
   * 2. Extrai os arquivos em memória
   * 3. Filtra o código-fonte relevante
   * 4. Executa a auditoria via roteador de IA com failover
   */
  async executeAudit(options: SandboxExecutionOptions): Promise<AuditReportResult> {
    const files =
      options.sourceType === "zip"
        ? this.extractZip(options.zipBuffer ?? new Uint8Array())
        : await this.fetchRepoFiles(options.repoUrl || "");

    const scannedFiles = this.collectSourceFiles(files);
    if (scannedFiles.length === 0) {
      throw new Error(
        "Não encontramos arquivos de código para analisar. Confira se a pasta enviada contém o projeto.",
      );
    }

    const filesSummary = scannedFiles
      .map((f) => `- ${f.path} (${f.content.length} bytes)`)
      .join("\n");

    const aiRouter = new AgnosticAIRouter(options.customEnv);
    return aiRouter.runAudit({
      systemInstructions: this.skillRules(),
      filesSummary,
      filesContent: scannedFiles,
    });
  }

  /**
   * Baixa um arquivo .zip a partir de um link comum (http/https).
   * Valida a assinatura do arquivo antes de entregar para a extração.
   */
  async downloadZip(url: string): Promise<Uint8Array> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("O link informado não é um endereço válido.");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("O link precisa começar com http:// ou https://.");
    }
    if (this.isBlockedHost(parsed.hostname)) {
      throw new Error("Esse endereço não pode ser analisado por motivos de segurança.");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": "sentinel-audit", Accept: "*/*" },
      });
      if (!res.ok) {
        throw new Error(`Não foi possível baixar o arquivo (HTTP ${res.status}).`);
      }
      const buffer = new Uint8Array(await res.arrayBuffer());
      if (buffer.length === 0) {
        throw new Error("O link não retornou nenhum conteúdo.");
      }
      if (buffer.length > MAX_ARCHIVE_BYTES) {
        throw new Error("O projeto é grande demais para analisar. Tente enviar apenas a pasta principal.");
      }
      // Assinatura ZIP: "PK" (0x50 0x4b).
      if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
        throw new Error(
          "O link não aponta para um arquivo .zip. Use um repositório git ou um link direto para um .zip.",
        );
      }
      return buffer;
    } catch (err: any) {
      if (err?.name === "AbortError") {
        throw new Error("O download demorou demais e foi interrompido.");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Bloqueia alvos internos/privados (proteção contra SSRF). */
  private isBlockedHost(hostname: string): boolean {
    const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (h === "localhost" || h.endsWith(".localhost") || h === "0.0.0.0") return true;
    if (h === "::1" || h === "::") return true;
    const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (a === 0 || a === 10 || a === 127) return true;
      if (a === 169 && b === 254) return true; // link-local (metadados de nuvem)
      if (a === 192 && b === 168) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
    }
    return false;
  }

  /** Repositório git → baixa o arquivo .zip do host e extrai na memória. */
  async fetchRepoFiles(repoUrl: string): Promise<Map<string, Uint8Array>> {
    const zipUrl = await this.resolveArchiveZipUrl(repoUrl);
    const bytes = await this.downloadZip(zipUrl);
    return this.extractZip(bytes);
  }

  /**
   * Converte um link de repositório (GitHub/GitLab/Bitbucket) no link do
   * arquivo .zip correspondente, descobrindo o branch padrão quando possível.
   */
  private async resolveArchiveZipUrl(repoUrl: string): Promise<string> {
    const clean = repoUrl.replace(/\.git$/i, "").replace(/\/+$/, "");

    // GitHub
    const gh = clean.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
    if (gh) {
      const [, owner, repo] = gh;
      const branch = (await this.githubDefaultBranch(owner, repo)) || "main";
      return `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${branch}`;
    }

    // GitLab (pode ter grupos aninhados: grupo/subgrupo/projeto)
    const gl = clean.match(/gitlab\.com\/(.+)$/i);
    if (gl) {
      const projectPath = gl[1].replace(/\/-\/.*$/, "");
      const branch = (await this.gitlabDefaultBranch(projectPath)) || "main";
      const repoName = projectPath.split("/").pop();
      return `https://gitlab.com/${projectPath}/-/archive/${branch}/${repoName}-${branch}.zip`;
    }

    // Bitbucket
    const bb = clean.match(/bitbucket\.org\/([^/]+)\/([^/#?]+)/i);
    if (bb) {
      const [, owner, repo] = bb;
      const branch = (await this.bitbucketDefaultBranch(owner, repo)) || "main";
      return `https://bitbucket.org/${owner}/${repo}/get/${branch}.zip`;
    }

    throw new Error(
      "Não reconhecemos esse link de repositório. Use um link do GitHub, GitLab ou Bitbucket, " +
        "ou um link direto para um arquivo .zip.",
    );
  }

  private async githubDefaultBranch(owner: string, repo: string): Promise<string | null> {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "sentinel-audit" },
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      return typeof data?.default_branch === "string" ? data.default_branch : null;
    } catch {
      return null;
    }
  }

  private async gitlabDefaultBranch(projectPath: string): Promise<string | null> {
    try {
      const res = await fetch(
        `https://gitlab.com/api/v4/projects/${encodeURIComponent(projectPath)}`,
        { headers: { "User-Agent": "sentinel-audit" } },
      );
      if (!res.ok) return null;
      const data: any = await res.json();
      return typeof data?.default_branch === "string" ? data.default_branch : null;
    } catch {
      return null;
    }
  }

  private async bitbucketDefaultBranch(owner: string, repo: string): Promise<string | null> {
    try {
      const res = await fetch(`https://api.bitbucket.org/2.0/repositories/${owner}/${repo}`, {
        headers: { "User-Agent": "sentinel-audit" },
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      return data?.mainbranch?.name ?? null;
    } catch {
      return null;
    }
  }

  /** Extrai um .zip em memória, removendo a pasta-raiz comum dos repositórios. */
  private extractZip(buffer: Uint8Array): Map<string, Uint8Array> {
    let raw: Record<string, Uint8Array>;
    try {
      raw = unzipSync(buffer);
    } catch {
      throw new Error("Não conseguimos abrir o arquivo enviado. Confirme que é uma pasta/.zip válido.");
    }

    const names = Object.keys(raw).filter((name) => !name.endsWith("/") && raw[name].length > 0);

    // Detecta a pasta-raiz comum (ex.: "projeto-main/") e a remove dos caminhos.
    let prefix = "";
    if (names.length > 0) {
      const firstSeg = names[0].split("/")[0];
      if (names.every((n) => n.startsWith(firstSeg + "/"))) {
        prefix = firstSeg + "/";
      }
    }

    const out = new Map<string, Uint8Array>();
    for (const name of names) {
      const cleaned = this.normalizePath(name.slice(prefix.length));
      if (!cleaned) continue;
      out.set(cleaned, raw[name]);
    }
    return out;
  }

  /** Normaliza o caminho e descarta entradas perigosas (Zip Slip / absolutas). */
  private normalizePath(name: string): string {
    const parts = name
      .replace(/\\/g, "/")
      .split("/")
      .filter((p) => p && p !== "." && p !== "..");
    return parts.join("/");
  }

  /** Coleta e filtra arquivos relevantes de código-fonte, ignorando ruídos. */
  private collectSourceFiles(files: Map<string, Uint8Array>): { path: string; content: string }[] {
    const results: { path: string; content: string }[] = [];
    const decoder = new TextDecoder("utf-8", { fatal: false });

    for (const [path, bytes] of files) {
      if (results.length >= MAX_FILES) break;
      if (path.split("/").some((seg) => IGNORED_DIRS.has(seg))) continue;

      const lower = path.toLowerCase();
      const base = lower.split("/").pop() || "";
      const ext = base.includes(".") ? "." + base.split(".").pop() : "";
      if (!ALLOWED_EXTENSIONS.has(ext) && !ALLOWED_EXTENSIONS.has(base)) continue;

      if (bytes.length === 0 || bytes.length >= MAX_FILE_BYTES) continue;

      // Descarta arquivos claramente binários (bytes nulos).
      if (bytes.includes(0)) continue;

      try {
        results.push({ path, content: decoder.decode(bytes) });
      } catch {
        // ignora arquivos ilegíveis
      }
    }
    return results;
  }

  /** Catálogo de regras de auditoria (OWASP/Cloudflare) usado como instrução da IA. */
  private skillRules(): string {
    return `
Diretrizes Cloudflare Security Audit:
- Identificar injeção de código, XSS, SSRF e SQL Injection.
- Detecção de segredos (chaves de API, senhas, tokens JWT e certificados).
- Verificação de políticas de CORS e cabeçalhos de segurança HTTP.
- Análise de autenticação/autorização, Broken Object Level Authorization (BOLA).
- Verificação de dependências desatualizadas ou maliciosas.
`.trim();
  }
}
