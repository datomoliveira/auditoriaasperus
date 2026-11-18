import { unzipSync } from "fflate";
import { AgnosticAIRouter, AuditReportResult } from "./ai-client";

export interface SandboxExecutionOptions {
  runId: string;
  sourceType: "zip" | "git" | "site";
  zipBuffer?: Uint8Array;
  repoUrl?: string;
  /** Endereço de um site publicado (ex.: https://meusite.com) para auditar a página no ar. */
  siteUrl?: string;
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
    let files: Map<string, Uint8Array>;
    if (options.sourceType === "zip") {
      files = this.extractZip(options.zipBuffer ?? new Uint8Array());
    } else if (options.sourceType === "git") {
      files = await this.fetchRepoFiles(options.repoUrl || "");
    } else {
      files = await this.fetchSiteFiles(options.siteUrl || options.repoUrl || "");
    }

    const scannedFiles = this.collectSourceFiles(files);
    if (scannedFiles.length === 0) {
      throw new Error(
        options.sourceType === "site"
          ? "Não encontramos conteúdo legível nesse site. Confira se o endereço abre no navegador."
          : "Não encontramos arquivos de código para analisar. Confira se a pasta enviada contém o projeto.",
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

  /**
   * Lê um site publicado no ar: baixa a página principal, os cabeçalhos de
   * resposta e os scripts que ela carrega (incluindo de CDNs). Não é um
   * "crawler" completo — respeita limites de tempo, quantidade e tamanho.
   */
  async fetchSiteFiles(siteUrl: string): Promise<Map<string, Uint8Array>> {
    let parsed: URL;
    try {
      parsed = new URL(siteUrl);
    } catch {
      throw new Error("O endereço informado não é um link válido.");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("O endereço precisa começar com http:// ou https://.");
    }
    if (this.isBlockedHost(parsed.hostname)) {
      throw new Error("Esse endereço não pode ser analisado por motivos de segurança.");
    }

    const encoder = new TextEncoder();
    const files = new Map<string, Uint8Array>();
    const host = parsed.hostname.replace(/[^a-z0-9.-]/gi, "_");

    // 1) Página principal + cabeçalhos de resposta (úteis p/ checar segurança HTTP).
    const page = await this.fetchTextResource(parsed.toString(), 30000, 2_000_000);
    if (page.finalUrl) {
      try {
        if (this.isBlockedHost(new URL(page.finalUrl).hostname)) {
          throw new Error("Esse endereço não pode ser analisado por motivos de segurança.");
        }
      } catch (e: any) {
        if (e?.message?.includes("motivos de segurança")) throw e;
      }
    }
    if (!page.text.trim()) {
      throw new Error("Não conseguimos ler o conteúdo publicado nesse endereço.");
    }

    files.set(`site/${host}/${this.pageFileName(parsed)}`, encoder.encode(page.text));
    files.set(
      `site/${host}/cabecalhos-http.json`,
      encoder.encode(JSON.stringify(page.headers, null, 2)),
    );

    // 2) Scripts referenciados pela página (mesmo site ou CDN), com limites.
    const base = page.finalUrl || parsed.toString();
    const scriptUrls = this.extractScriptUrls(page.text, base)
      .filter((u) => {
        try {
          return !this.isBlockedHost(new URL(u).hostname);
        } catch {
          return false;
        }
      })
      .slice(0, 15);

    await Promise.all(
      scriptUrls.map(async (u) => {
        try {
          const res = await this.fetchTextResource(u, 20000, MAX_FILE_BYTES);
          if (!res.text || res.text.includes("\u0000")) return;
          files.set(`site/${host}/${this.resourcePath(u)}`, encoder.encode(res.text));
        } catch {
          // script indisponível — segue a análise sem ele
        }
      }),
    );

    return files;
  }

  /** Baixa um recurso de texto com timeout e limite de tamanho. */
  private async fetchTextResource(
    url: string,
    timeoutMs: number,
    maxBytes: number,
  ): Promise<{ text: string; headers: Record<string, string>; finalUrl: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "sentinel-audit",
          Accept: "text/html,application/xhtml+xml,application/javascript,text/javascript,application/json,*/*",
        },
      });

      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });

      if (!res.ok) {
        throw new Error(`Não foi possível acessar o endereço (HTTP ${res.status}).`);
      }

      const declared = Number(res.headers.get("content-length") || 0);
      if (declared && declared > maxBytes) {
        throw new Error("O conteúdo desse endereço é grande demais para analisar.");
      }

      const text = await res.text();
      return {
        text: text.length > maxBytes ? text.slice(0, maxBytes) : text,
        headers,
        finalUrl: res.url || url,
      };
    } catch (err: any) {
      if (err?.name === "AbortError") {
        throw new Error("O site demorou demais para responder.");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Nome legível para a página principal (ex.: "/" → index.html, "/sobre" → sobre.html). */
  private pageFileName(u: URL): string {
    const last = u.pathname.split("/").filter(Boolean).pop() || "";
    if (!last) return "index.html";
    return /\.[a-z0-9]+$/i.test(last) ? last : `${last}.html`;
  }

  /** Caminho legível para um recurso remoto (ex.: "/a/app.js" → "a/app.js"). */
  private resourcePath(rawUrl: string): string {
    try {
      const u = new URL(rawUrl);
      const parts = u.pathname.split("/").filter(Boolean);
      let last = parts.pop() || "recurso";
      if (!/\.[a-z0-9]+$/i.test(last)) last += ".js";
      return [...parts, last].join("/");
    } catch {
      return `recurso-${Math.random().toString(36).slice(2, 8)}.js`;
    }
  }

  /** Extrai os endereços de <script src="..."> de uma página HTML. */
  private extractScriptUrls(html: string, base: string): string[] {
    const urls: string[] = [];
    const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      try {
        const abs = new URL(m[1], base).toString();
        if (/^https?:/i.test(abs)) urls.push(abs);
      } catch {
        // endereço inválido — ignora
      }
    }
    return [...new Set(urls)];
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
