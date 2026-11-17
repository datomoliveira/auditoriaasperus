import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import AdmZip from "adm-zip";
import { AgnosticAIRouter, AuditReportResult } from "./ai-client";

export interface SandboxExecutionOptions {
  runId: string;
  sourceType: "zip" | "git";
  zipBuffer?: Buffer;
  repoUrl?: string;
  customEnv?: Record<string, string | undefined>;
}

export class AuditSandbox {
  private baseSandboxDir: string;

  constructor(baseDir = "/tmp/security-audit-sandbox") {
    this.baseSandboxDir = baseDir;
    if (!fs.existsSync(this.baseSandboxDir)) {
      fs.mkdirSync(this.baseSandboxDir, { recursive: true });
    }
  }

  /**
   * Orquestra a execução completa da sandbox:
   * 1. Isola os arquivos no diretório temporário
   * 2. Instala a skill de auditoria via npx skills add
   * 3. Filtra e extrai o código fonte do cliente
   * 4. Executa a auditoria através do AgnosticAIClient
   */
  async executeAudit(options: SandboxExecutionOptions): Promise<AuditReportResult> {
    const sandboxPath = path.join(this.baseSandboxDir, options.runId);
    fs.mkdirSync(sandboxPath, { recursive: true });

    const clientCodePath = path.join(sandboxPath, "target-code");
    fs.mkdirSync(clientCodePath, { recursive: true });

    try {
      // 1. Extração dos arquivos do cliente
      if (options.sourceType === "zip" && options.zipBuffer) {
        this.extractZipSafely(options.zipBuffer, clientCodePath);
      } else if (options.sourceType === "git" && options.repoUrl) {
        this.cloneGitRepo(options.repoUrl, clientCodePath);
      } else {
        throw new Error("Fonte de código inválida: forneça um arquivo .zip ou URL de repositório.");
      }

      // 2. Instalação da skill de auditoria via npx skills
      const skillRules = this.orchestrateSecuritySkill(sandboxPath);

      // 3. Leitura e indexação dos arquivos de código fonte do cliente
      const scannedFiles = this.collectSourceFiles(clientCodePath);
      if (scannedFiles.length === 0) {
        throw new Error("Nenhum arquivo de código fonte legível encontrado para auditoria.");
      }

      const filesSummary = scannedFiles.map((f) => `- ${f.path} (${f.content.length} bytes)`).join("\n");

      // 4. Execução do Agente de Auditoria com Roteamento e Fallback Automático de IA
      const aiRouter = new AgnosticAIRouter(options.customEnv);
      const auditResult = await aiRouter.runAudit({
        systemInstructions: skillRules,
        filesSummary,
        filesContent: scannedFiles,
      });

      return auditResult;
    } finally {
      // Limpeza opcional da sandbox após a execução
      try {
        fs.rmSync(sandboxPath, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn(`[Sandbox Cleanup Warning]: Falha ao limpar ${sandboxPath}:`, cleanupErr);
      }
    }
  }

  /**
   * Extrai o ZIP prevenindo vulnerabilidades de Path Traversal (Zip Slip)
   */
  private extractZipSafely(buffer: Buffer, targetDir: string): void {
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();

    for (const entry of zipEntries) {
      const entryName = entry.entryName;
      const targetFilePath = path.join(targetDir, entryName);

      // Proteção estrita contra Zip-Slip
      if (!targetFilePath.startsWith(targetDir)) {
        throw new Error(`[Security Alert] Tentativa de Zip Slip detectada no arquivo: ${entryName}`);
      }

      if (entry.isDirectory) {
        fs.mkdirSync(targetFilePath, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(targetFilePath), { recursive: true });
        fs.writeFileSync(targetFilePath, entry.getData());
      }
    }
  }

  /**
   * Clona o repositório git do cliente de forma isolada
   */
  private cloneGitRepo(repoUrl: string, targetDir: string): void {
    // Sanitização básica da URL
    const sanitizedUrl = repoUrl.replace(/["';`$]/g, "");
    execSync(`git clone --depth 1 "${sanitizedUrl}" "${targetDir}"`, {
      timeout: 30000,
      stdio: "pipe",
    });
  }

  /**
   * Baixa um arquivo .zip a partir de um link comum (http/https).
   * Valida a assinatura do arquivo antes de entregar para a extração.
   */
  async downloadZip(url: string): Promise<Buffer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(url, { redirect: "follow", signal: controller.signal });
      if (!res.ok) {
        throw new Error(`Não foi possível baixar o arquivo (HTTP ${res.status}).`);
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length === 0) {
        throw new Error("O link não retornou nenhum conteúdo.");
      }
      // Assinatura ZIP: "PK" (0x50 0x4b).
      const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
      if (!isZip) {
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
   * Orquestra a skill de auditoria no diretório da sandbox
   */
  private orchestrateSecuritySkill(sandboxPath: string): string {
    let skillRules = `
Diretrizes Cloudflare Security Audit:
- Identificar injeção de código, XSS, SSRF e SQL Injection.
- Detecção de segredos (chaves de API, senhas, tokens JWT e certificados).
- Verificação de políticas de CORS e cabeçalhos de segurança HTTP.
- Análise de autenticação/autorização, Broken Object Level Authorization (BOLA).
- Verificação de dependências desatualizadas ou maliciosas.
`;

    try {
      // Executa o comando de instalação da skill conforme solicitado
      console.log(`[Sandbox] Instalando skill security-audit em ${sandboxPath}...`);
      execSync(`npx --yes skills add https://github.com/cloudflare/security-audit-skill -y`, {
        cwd: sandboxPath,
        timeout: 45000,
        stdio: "pipe",
      });

      // Tenta ler o SKILL.md gerado pela instalação
      const possibleSkillPaths = [
        path.join(sandboxPath, ".agents/skills/security-audit/SKILL.md"),
        path.join(sandboxPath, ".agents/skills/security-audit-skill/SKILL.md"),
        path.join(sandboxPath, "SKILL.md"),
      ];

      for (const skillFile of possibleSkillPaths) {
        if (fs.existsSync(skillFile)) {
          skillRules += "\n" + fs.readFileSync(skillFile, "utf-8");
          break;
        }
      }
    } catch (err) {
      console.log("[Sandbox Info] Execução do comando npx skills finalizada. Aplicando catálogo de regras de segurança OWASP/Cloudflare.");
    }

    return skillRules;
  }

  /**
   * Coleta e filtra arquivos relevantes de código fonte, ignorando ruídos
   */
  private collectSourceFiles(dir: string, maxFiles = 30): { path: string; content: string }[] {
    const results: { path: string; content: string }[] = [];
    const ignoredDirs = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", ".agents"]);
    const allowedExtensions = new Set([
      ".js", ".ts", ".jsx", ".tsx", ".py", ".go", ".rs", ".php", ".rb", ".java",
      ".json", ".yaml", ".yml", ".toml", ".env.example", ".sql", ".sh", "dockerfile"
    ]);

    const traverse = (currentDir: string) => {
      if (results.length >= maxFiles) return;

      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= maxFiles) break;

        const fullPath = path.join(currentDir, entry.name);
        const relativePath = path.relative(dir, fullPath);

        if (entry.isDirectory()) {
          if (!ignoredDirs.has(entry.name)) {
            traverse(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          const base = entry.name.toLowerCase();

          if (allowedExtensions.has(ext) || allowedExtensions.has(base)) {
            try {
              const stat = fs.statSync(fullPath);
              // Ignora arquivos gigantescos (> 300KB) para não exceder limites de contexto da IA
              if (stat.size < 300000) {
                const content = fs.readFileSync(fullPath, "utf-8");
                results.push({ path: relativePath, content });
              }
            } catch {
              // Ignora arquivos binários ou ilegíveis
            }
          }
        }
      }
    };

    traverse(dir);
    return results;
  }
}
