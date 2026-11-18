/**
 * Agnostic AI Router com Fallback & Failover Automático
 * 
 * Permite cadastrar múltiplos provedores de IA gratuitos (Groq, Ollama, DeepSeek, OpenRouter, Cloudflare AI).
 * Se o provedor primário atingir Rate Limit (429), Timeout ou erro de rede, o roteador
 * chaveia automaticamente para o próximo provedor da cadeia sem interromper a auditoria.
 * 
 * ZERO HARDCODED KEYS - 100% via process.env ou runtime context.
 */

export interface AuditPromptInput {
  systemInstructions: string;
  filesSummary: string;
  filesContent: { path: string; content: string }[];
}

export interface SecurityIssue {
  id: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  category: "Injection" | "Auth & Access" | "Secrets Leak" | "Config / Insecure Deps" | "Code Quality";
  file: string;
  line?: number;
  description: string;
  recommendation: string;
  remediatedCodeSnippet?: string;
}

export interface ProviderAttemptLog {
  providerName: string;
  endpoint: string;
  model: string;
  status: "success" | "failed";
  durationMs: number;
  error?: string;
}

export interface AuditReportResult {
  score: number; // 0 a 100
  summary: string;
  totalIssues: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  issues: SecurityIssue[];
  auditedFilesCount: number;
  providerUsed: string;
  modelUsed: string;
  failoverOccurred: boolean;
  routingLogs: ProviderAttemptLog[];
  timestamp: string;
}

export interface AIProviderConfig {
  name: string;
  endpoint: string;
  apiKey?: string;
  model: string;
  /** Modelos alternativos do mesmo provedor, tentados em ordem se o principal falhar. */
  fallbackModels?: string[];
  timeoutMs?: number;
}

export class AgnosticAIRouter {
  private providers: AIProviderConfig[] = [];

  constructor(customEnv?: Record<string, string | undefined>) {
    const env = customEnv || process.env;
    this.providers = this.discoverAndBuildProviderChain(env);

    if (this.providers.length === 0) {
      // Detalhe técnico só no console; o usuário vê um aviso claro e sem jargão.
      console.error(
        "[AIRouter Error] Nenhum provedor de IA configurado. " +
          "Defina ao menos uma chave (AI_API_KEY_GROK, AI_API_KEY_GOOGLE ou AI_API_KEY_OLLAMA).",
      );
      throw new Error(
        "Nenhuma inteligência artificial conseguiu concluir a verificação. " +
          "Todas as opções configuradas falharam — tente novamente em alguns instantes.",
      );
    }
  }

  /**
   * Constrói a lista ordenada de provedores a partir das variáveis de ambiente.
   * Suporta definição de ordem prioritária via AI_ROUTING_CHAIN (ex: "groq,ollama,deepseek")
   */
  private discoverAndBuildProviderChain(env: Record<string, string | undefined>): AIProviderConfig[] {
    const registry: Record<string, AIProviderConfig | null> = {};

    // Provedores nomeados por sufixo: AI_API_KEY_<PROVEDOR>
    // Estes são os nomes usados como secrets no Cloudflare:
    // AI_API_KEY_GROK, AI_API_KEY_GOOGLE, AI_API_KEY_OLLAMA.

    // Grok (xAI) — AI_API_KEY_GROK
    if (env.AI_API_KEY_GROK) {
      registry["grok"] = {
        name: "Grok (xAI)",
        endpoint: (env.AI_ENDPOINT_GROK || "https://api.x.ai/v1").trim(),
        apiKey: env.AI_API_KEY_GROK.trim(),
        model: env.AI_MODEL_GROK || "grok-4.7",
        fallbackModels: ["grok-4.6", "grok-4.5"],
        timeoutMs: 35000,
      };
    }

    // Google Gemini — AI_API_KEY_GOOGLE (endpoint compatível com OpenAI)
    if (env.AI_API_KEY_GOOGLE) {
      registry["google"] = {
        name: "Google Gemini",
        endpoint: (
          env.AI_ENDPOINT_GOOGLE || "https://generativelanguage.googleapis.com/v1beta/openai"
        ).trim(),
        apiKey: env.AI_API_KEY_GOOGLE.trim(),
        model: env.AI_MODEL_GOOGLE || "gemini-3.5-flash",
        // Modelos costumam ficar saturados (503) ou sair de linha; tentamos
        // alternativas automaticamente antes de desistir do provedor.
        fallbackModels: ["gemini-3.1-flash-lite", "gemini-flash-lite-latest"],
        timeoutMs: 35000,
      };
    }

    // 1. Provedor Groq (Gratuito e Ultra-rápido)
    if (env.GROQ_API_KEY) {
      registry["groq"] = {
        name: "Groq (Llama 3.3 70B)",
        endpoint: (env.GROQ_ENDPOINT || "https://api.groq.com/openai/v1").trim(),
        apiKey: env.GROQ_API_KEY.trim(),
        model: env.GROQ_MODEL || "llama-3.3-70b-versatile",
        timeoutMs: 25000,
      };
    }

    // 2. Provedor Ollama (Local/Offline ou Cloud) — aceita AI_API_KEY_OLLAMA
    const ollamaEndpoint =
      env.AI_ENDPOINT_OLLAMA ||
      env.OLLAMA_ENDPOINT ||
      (env.ENABLE_OLLAMA === "true" ? "http://localhost:11434/v1" : undefined);
    if (ollamaEndpoint || env.AI_API_KEY_OLLAMA) {
      registry["ollama"] = {
        name: "Ollama",
        endpoint: (ollamaEndpoint || "http://localhost:11434/v1").trim(),
        apiKey: env.AI_API_KEY_OLLAMA?.trim() || env.OLLAMA_API_KEY || "ollama",
        model: env.AI_MODEL_OLLAMA || env.OLLAMA_MODEL || "llama3.2",
        timeoutMs: 60000, // Modelos locais podem demandar mais tempo
      };
    }

    // 3. Provedor DeepSeek
    if (env.DEEPSEEK_API_KEY) {
      registry["deepseek"] = {
        name: "DeepSeek API",
        endpoint: (env.DEEPSEEK_ENDPOINT || "https://api.deepseek.com/v1").trim(),
        apiKey: env.DEEPSEEK_API_KEY.trim(),
        model: env.DEEPSEEK_MODEL || "deepseek-chat",
        timeoutMs: 35000,
      };
    }

    // 4. Provedor OpenRouter (Free Tier Models)
    if (env.OPENROUTER_API_KEY) {
      registry["openrouter"] = {
        name: "OpenRouter (Free Tier)",
        endpoint: (env.OPENROUTER_ENDPOINT || "https://openrouter.ai/api/v1").trim(),
        apiKey: env.OPENROUTER_API_KEY.trim(),
        model: env.OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free",
        // Modelos gratuitos saem de linha/entram em rate limit com frequência.
        fallbackModels: [
          "recursive/flint-v1.0:free",
          "baidu/ernie-5.5-flash-preview:free",
          "nvidia/nemotron-3.5-super-vl:free",
          "cohere/north-mini-code:free",
          "particle-ai/particle-1:free",
        ],
        timeoutMs: 45000,
      };
    }

    // 5. Provedor NVIDIA NIM (build.nvidia.com / integrate.api.nvidia.com)
    if (env.AI_API_KEY_NVIDIA || env.NVIDIA_API_KEY) {
      registry["nvidia"] = {
        name: "NVIDIA NIM",
        endpoint: (env.AI_ENDPOINT_NVIDIA || "https://integrate.api.nvidia.com/v1").trim(),
        apiKey: (env.AI_API_KEY_NVIDIA || env.NVIDIA_API_KEY)!.trim(),
        model: env.AI_MODEL_NVIDIA || "nvidia/nemotron-3-ultra-550b-a55b",
        fallbackModels: [
          "poolside/laguna-xs-2.1",
          "nvidia/nemotron-3.5-super-vl-120b-a12b",
          "google/gemma-4-31b-it",
        ],
        timeoutMs: 45000,
      };
    }

    // 6. Provedor Cloudflare Workers AI
    if (env.CLOUDFLARE_AI_TOKEN && env.CLOUDFLARE_ACCOUNT_ID) {
      registry["cloudflare"] = {
        name: "Cloudflare Workers AI",
        endpoint: `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
        apiKey: env.CLOUDFLARE_AI_TOKEN.trim(),
        model: env.CLOUDFLARE_AI_MODEL || "@cf/meta/llama-3.3-70b-instruct",
        timeoutMs: 30000,
      };
    }

    // 7. Configuração Genérica Fallback (AI_API_ENDPOINT / AI_API_KEY)
    if (env.AI_API_ENDPOINT) {
      registry["custom_primary"] = {
        name: "Custom Primary AI",
        endpoint: env.AI_API_ENDPOINT.trim(),
        apiKey: env.AI_API_KEY?.trim(),
        model: env.AI_MODEL || "llama-3.3-70b-versatile",
        timeoutMs: 30000,
      };
    }

    // 8. Provedor Genérico de Reserva Secundário
    if (env.FALLBACK_AI_API_ENDPOINT) {
      registry["custom_fallback"] = {
        name: "Custom Fallback AI",
        endpoint: env.FALLBACK_AI_API_ENDPOINT.trim(),
        apiKey: env.FALLBACK_AI_API_KEY?.trim(),
        model: env.FALLBACK_AI_MODEL || "llama-3.3-70b-versatile",
        timeoutMs: 30000,
      };
    }

    // Ordenação do Roteador:
    // Se o usuário definiu AI_ROUTING_CHAIN="groq,ollama,deepseek", respeita a ordem exata.
    const chainConfig = env.AI_ROUTING_CHAIN
      ? env.AI_ROUTING_CHAIN.split(",").map((k) => k.trim().toLowerCase())
      : ["google", "nvidia", "openrouter", "grok", "ollama", "groq", "deepseek", "cloudflare", "custom_primary", "custom_fallback"];

    const activeChain: AIProviderConfig[] = [];
    for (const key of chainConfig) {
      const provider = registry[key];
      if (provider) {
        activeChain.push(provider);
      }
    }

    // Adiciona quaisquer provedores configurados que não tenham sido incluídos na chain explícita
    for (const [key, provider] of Object.entries(registry)) {
      if (provider && !activeChain.includes(provider)) {
        activeChain.push(provider);
      }
    }

    return activeChain;
  }

  /**
   * Retorna os metadados dos provedores disponíveis (sem expor as chaves de API)
   */
  getConfiguredProvidersInfo() {
    return this.providers.map((p, idx) => ({
      priority: idx + 1,
      name: p.name,
      endpointHost: new URL(p.endpoint).hostname,
      model: p.model,
      isLocal: p.endpoint.includes("localhost") || p.endpoint.includes("127.0.0.1"),
      timeoutMs: p.timeoutMs,
    }));
  }

  /**
   * Executa a auditoria com Roteamento e Fallback Automático:
   * Itera pelos provedores em ordem de prioridade.
   * Se o primário falhar (HTTP 429 Rate Limit, 5xx ou Timeout), tenta o próximo imediatamente.
   */
  async runAudit(input: AuditPromptInput): Promise<AuditReportResult> {
    const routingLogs: ProviderAttemptLog[] = [];
    const systemPrompt = `
Você é o Chief Information Security Officer (CISO) e Auditor Especialista em Segurança de Software.
Sua missão é auditar meticulosamente o código fornecido, orquestrando as diretrizes do Security Audit Skill.

Regras de Auditoria:
1. Analise vulnerabilidades críticas: Injeção (SQL, XSS, Command Injection), vazamento de credenciais e chaves expostas, falhas de autenticação/autorização (IDOR, Broken Access Control), dependências vulneráveis e configurações inseguras.
2. Seja rigoroso e assertivo, eliminando falsos positivos.
3. Responda ESTRITAMENTE em formato JSON com o seguinte schema:
{
  "score": number, // Nota de segurança de 0 a 100 (100 = código exemplar, sem vulnerabilidades)
  "summary": "Resumo executivo da postura de segurança em 2 a 3 parágrafos",
  "issues": [
    {
      "id": "SEC-001",
      "severity": "critical" | "high" | "medium" | "low" | "info",
      "title": "Título conciso da vulnerabilidade",
      "category": "Injection" | "Auth & Access" | "Secrets Leak" | "Config / Insecure Deps" | "Code Quality",
      "file": "caminho/do/arquivo.ext",
      "line": 42,
      "description": "Explicação detalhada do risco e do impacto",
      "recommendation": "Passos exatos para correção",
      "remediatedCodeSnippet": "Exemplo do código seguro corrigido"
    }
  ]
}
`.trim();

    const userPrompt = `
=== ARQUIVOS AUDITADOS ===
${input.filesSummary}

=== DETALHES DO CÓDIGO FONTE ===
${input.filesContent
  .map((f) => `--- ARQUIVO: ${f.path} ---\n${f.content.slice(0, 15000)}`)
  .join("\n\n")}

=== INSTRUÇÕES ADICIONAIS DA SKILL ===
${input.systemInstructions}
`.trim();

    let lastError: Error | null = null;

    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];
      const models = this.modelsFor(provider);

      for (let m = 0; m < models.length; m++) {
        const model = models[m];
        const startTime = Date.now();
        console.log(
          `[AI Router] [Provedor ${i + 1}/${this.providers.length} | Modelo ${m + 1}/${models.length}] ` +
            `Enviando auditoria para: ${provider.name} (${model})...`
        );

        try {
          const result = await this.executeSingleProvider(provider, model, systemPrompt, userPrompt);
          const durationMs = Date.now() - startTime;

          routingLogs.push({
            providerName: provider.name,
            endpoint: provider.endpoint,
            model,
            status: "success",
            durationMs,
          });

          console.log(`[AI Router] Sucesso via ${provider.name} (${model}) em ${durationMs}ms!`);

          return {
            ...result,
            auditedFilesCount: input.filesContent.length,
            providerUsed: provider.name,
            modelUsed: model,
            failoverOccurred: i > 0 || m > 0, // Houve chaveamento se não foi a primeira opção
            routingLogs,
            timestamp: new Date().toISOString(),
          };
        } catch (err: any) {
          const durationMs = Date.now() - startTime;
          const errMsg = err.message || "Erro desconhecido na requisição";
          const hasMoreModels = m < models.length - 1;
          const hasMoreProviders = i < this.providers.length - 1;

          console.warn(
            `[AI Router] ⚠️ Falha em ${provider.name} (${model}) (${durationMs}ms): ${errMsg}. ` +
              (hasMoreModels
                ? `Tentando outro modelo do mesmo provedor...`
                : hasMoreProviders
                  ? `Chaveando para o próximo provedor...`
                  : `Todos os provedores falharam.`)
          );

          routingLogs.push({
            providerName: provider.name,
            endpoint: provider.endpoint,
            model,
            status: "failed",
            durationMs,
            error: errMsg,
          });

          lastError = err;
        }
      }
    }

    // Se todos os provedores falharem: registra o detalhe técnico no console
    // (nunca exposto ao usuário) e devolve um aviso claro, sem nomes de modelo.
    console.error(
      `[AI Router Failover Esgotado] Todos os ${this.providers.length} provedores falharam:\n` +
        routingLogs
          .map((log) => ` - ${log.providerName} (${log.model}): ${log.error} (${log.durationMs}ms)`)
          .join("\n") +
        `\nÚltimo erro: ${lastError?.message}`,
    );

    throw new Error(
      "Nenhuma inteligência artificial conseguiu concluir a verificação. " +
        "Todas as opções configuradas falharam — tente novamente em alguns instantes.",
    );
  }

  /** Lista ordenada de modelos a tentar num provedor (principal + alternativos). */
  private modelsFor(provider: AIProviderConfig): string[] {
    const list = [provider.model, ...(provider.fallbackModels || [])]
      .flatMap((m) => String(m).split(","))
      .map((m) => m.trim())
      .filter(Boolean);
    return [...new Set(list)];
  }

  /**
   * Chamada HTTP com timeout individual e tratamento de parsing
   */
  private async executeSingleProvider(
    provider: AIProviderConfig,
    model: string,
    systemPrompt: string,
    userPrompt: string
  ): Promise<Omit<AuditReportResult, "auditedFilesCount" | "providerUsed" | "modelUsed" | "failoverOccurred" | "routingLogs" | "timestamp">> {
    const completionsUrl = provider.endpoint.endsWith("/")
      ? `${provider.endpoint}chat/completions`
      : `${provider.endpoint}/chat/completions`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (provider.apiKey) {
      headers["Authorization"] = `Bearer ${provider.apiKey}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), provider.timeoutMs || 30000);

    try {
      const response = await fetch(completionsUrl, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status} (${response.statusText}): ${errorText.slice(0, 300)}`);
      }

      const jsonResponse: any = await response.json();
      const rawContent = jsonResponse.choices?.[0]?.message?.content || "{}";

      let parsedAudit: any;
      try {
        parsedAudit = JSON.parse(rawContent);
      } catch {
        const cleaned = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();
        parsedAudit = JSON.parse(cleaned);
      }

      const issues: SecurityIssue[] = parsedAudit.issues || [];
      return {
        score: typeof parsedAudit.score === "number" ? parsedAudit.score : 85,
        summary: parsedAudit.summary || "Auditoria realizada com sucesso.",
        totalIssues: issues.length,
        criticalCount: issues.filter((i) => i.severity === "critical").length,
        highCount: issues.filter((i) => i.severity === "high").length,
        mediumCount: issues.filter((i) => i.severity === "medium").length,
        lowCount: issues.filter((i) => i.severity === "low" || i.severity === "info").length,
        issues,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
