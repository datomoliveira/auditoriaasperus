import React, { useState, useRef, useEffect } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  UploadCloud,
  Globe,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Check,
  RefreshCw,
  Cpu,
  Layers,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  Zap,
  Activity,
  Server
} from "lucide-react";

interface SecurityIssue {
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

interface ProviderAttemptLog {
  providerName: string;
  endpoint: string;
  model: string;
  status: "success" | "failed";
  durationMs: number;
  error?: string;
}

interface AuditReport {
  score: number;
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
  routingLogs?: ProviderAttemptLog[];
  timestamp: string;
}

interface HealthConfig {
  providersCount: number;
  primaryProvider: string;
  routingChain: Array<{ priority: number; name: string; isLocal: boolean; model: string }>;
}

export function App() {
  const [activeTab, setActiveTab] = useState<"zip" | "url">("zip");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  
  // Estados de execução e roteador
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditProgressStage, setAuditProgressStage] = useState<string>("");
  const [report, setReport] = useState<AuditReport | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [healthInfo, setHealthInfo] = useState<HealthConfig | null>(null);
  const [showRoutingLogs, setShowRoutingLogs] = useState(false);
  
  // Filtros
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all");
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [copiedSnippetId, setCopiedSnippetId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:8787";

  // Busca status do roteador ao carregar
  useEffect(() => {
    fetch(`${API_BASE_URL}/health`)
      .then((res) => res.json())
      .then((data) => {
        if (data.routingChain) {
          setHealthInfo({
            providersCount: data.providersCount,
            primaryProvider: data.primaryProvider,
            routingChain: data.routingChain,
          });
        }
      })
      .catch(() => {
        // Fallback silencioso caso a API ainda não esteja de pé
      });
  }, [API_BASE_URL]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.name.endsWith(".zip")) {
        setSelectedFile(file);
        setErrorMsg(null);
      } else {
        setErrorMsg("Selecione um arquivo .zip válido.");
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith(".zip")) {
        setSelectedFile(file);
        setErrorMsg(null);
      } else {
        setErrorMsg("Apenas arquivos no formato .zip são suportados.");
      }
    }
  };

  const startAudit = async () => {
    setIsAuditing(true);
    setErrorMsg(null);
    setReport(null);

    try {
      setAuditProgressStage("Isolando ambiente sandbox...");
      await new Promise((r) => setTimeout(r, 600));

      setAuditProgressStage("Orquestrando Cloudflare Security Audit Skill...");
      await new Promise((r) => setTimeout(r, 800));

      setAuditProgressStage("Roteando para motor de IA com failover resiliente...");

      let res: Response;
      if (activeTab === "zip") {
        if (!selectedFile) throw new Error("Selecione um arquivo .zip primeiro.");
        const formData = new FormData();
        formData.append("file", selectedFile);

        res = await fetch(`${API_BASE_URL}/api/audit/zip`, {
          method: "POST",
          body: formData,
        });
      } else {
        if (!repoUrl) throw new Error("Insira a URL do repositório Git.");
        res = await fetch(`${API_BASE_URL}/api/audit/url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: repoUrl }),
        });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro HTTP ${res.status}: Falha ao processar.`);
      }

      const data: AuditReport = await res.json();
      setReport(data);
    } catch (err: any) {
      console.error("Erro na auditoria:", err);
      setErrorMsg(err.message || "Erro inesperado ao executar a auditoria.");
    } finally {
      setIsAuditing(false);
      setAuditProgressStage("");
    }
  };

  const copySnippet = (id: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedSnippetId(id);
    setTimeout(() => setCopiedSnippetId(null), 2000);
  };

  const filteredIssues = report?.issues.filter((issue) => {
    if (selectedSeverity === "all") return true;
    return issue.severity === selectedSeverity;
  });

  return (
    <div className="min-h-screen bg-black text-[#F5F5F7] flex flex-col selection:bg-blue-600 selection:text-white">
      {/* Background Sheen & Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-15%] left-[50%] translate-x-[-50%] w-[850px] h-[450px] bg-gradient-to-b from-blue-600/15 via-indigo-600/10 to-transparent blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[400px] bg-purple-600/10 blur-[140px] rounded-full" />
      </div>

      {/* Header com Frosted Glass */}
      <header className="sticky top-0 z-50 backdrop-blur-2xl bg-black/60 border-b border-white/[0.08] transition-all">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shadow-lg shadow-white/10">
              <ShieldCheck className="w-5 h-5 text-black stroke-[2.2]" />
            </div>
            <div className="flex flex-col">
              <span className="font-medium tracking-tight text-white text-sm">Auditoria Cloudflare</span>
              <span className="text-[10px] text-neutral-400 font-mono tracking-wider">AI FAILOVER ROUTER</span>
            </div>
          </div>

          {/* Rota Ativa de Provedores */}
          <div className="flex items-center gap-2">
            {healthInfo && healthInfo.routingChain.length > 0 ? (
              <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs text-neutral-300">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-neutral-400">Roteamento:</span>
                {healthInfo.routingChain.map((p, idx) => (
                  <React.Fragment key={p.name}>
                    <span className="text-white font-medium">{p.name.split(" ")[0]}</span>
                    {idx < healthInfo.routingChain.length - 1 && (
                      <ArrowRight className="w-3 h-3 text-neutral-500" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs text-neutral-300">
                <Cpu className="w-3.5 h-3.5 text-blue-400" />
                <span>Roteador Multi-IA Ativo</span>
              </div>
            )}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              100% Free Tier
            </span>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-12 z-10">
        {!report ? (
          <div className="flex flex-col items-center">
            {/* Hero Minimalista */}
            <div className="text-center space-y-4 max-w-2xl mb-10">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.1] text-xs font-medium text-neutral-300">
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                Failover Resiliente entre Múltiplas IAs Gratuitas
              </div>
              <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight text-white apple-gradient-text leading-[1.1]">
                Auditoria de código com alta disponibilidade.
              </h1>
              <p className="text-neutral-400 text-base sm:text-lg font-normal leading-relaxed">
                Envie seu código para inspeção contínua. Caso uma API atinja limites de requisição (429 Rate Limit),
                o roteador chaveia instantaneamente para outro modelo sem interromper sua análise.
              </p>
            </div>

            {/* Segmented Control */}
            <div className="w-full max-w-xl mb-6">
              <div className="grid grid-cols-2 p-1 bg-neutral-900/80 backdrop-blur-xl border border-white/[0.08] rounded-2xl">
                <button
                  type="button"
                  onClick={() => setActiveTab("zip")}
                  className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition-all ${
                    activeTab === "zip"
                      ? "bg-white text-black shadow-md shadow-white/10"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <UploadCloud className="w-4 h-4" />
                  Arquivo .ZIP
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("url")}
                  className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition-all ${
                    activeTab === "url"
                      ? "bg-white text-black shadow-md shadow-white/10"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <Globe className="w-4 h-4" />
                  Repositório Git
                </button>
              </div>
            </div>

            {/* Card Principal de Entrada */}
            <div className="w-full max-w-xl glass-panel rounded-3xl p-8 relative overflow-hidden">
              {activeTab === "zip" ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 ${
                    isDragging
                      ? "border-blue-500 bg-blue-500/10 scale-[1.01]"
                      : "border-white/[0.12] hover:border-white/[0.25] hover:bg-white/[0.02]"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="w-16 h-16 rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center mb-4 text-blue-400">
                    <UploadCloud className="w-8 h-8 stroke-[1.8]" />
                  </div>
                  <h3 className="text-white font-medium text-base mb-1">
                    {selectedFile ? selectedFile.name : "Arraste seu projeto (.zip) ou clique aqui"}
                  </h3>
                  <p className="text-neutral-400 text-xs">
                    {selectedFile
                      ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Pronto para auditar`
                      : "Compacte o código fonte da sua aplicação (Máximo 25MB)"}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="block text-xs font-medium text-neutral-300">
                    URL PÚBLICA DO REPOSITÓRIO GITHUB / GITLAB
                  </label>
                  <div className="relative">
                    <Globe className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                    <input
                      type="url"
                      placeholder="https://github.com/empresa/meu-projeto"
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      className="w-full pl-12 pr-4 py-3.5 bg-black/40 border border-white/[0.12] focus:border-blue-500 focus:outline-none rounded-2xl text-sm text-white placeholder-neutral-600 transition-all font-mono"
                    />
                  </div>
                  <p className="text-[11px] text-neutral-400">
                    Clonagem segura isolada temporariamente na sandbox.
                  </p>
                </div>
              )}

              {errorMsg && (
                <div className="mt-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                  <XCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                type="button"
                disabled={isAuditing || (activeTab === "zip" && !selectedFile) || (activeTab === "url" && !repoUrl)}
                onClick={startAudit}
                className="w-full mt-6 py-3.5 px-6 rounded-2xl bg-white text-black font-semibold text-sm hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-white/10 flex items-center justify-center gap-2"
              >
                {isAuditing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    {auditProgressStage}
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    Iniciar Auditoria Resiliente
                  </>
                )}
              </button>
            </div>

            {/* Destaques das APIs Gratuitas Plugadas */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-xl mt-8">
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center">
                <div className="text-white text-xs font-semibold mb-1">Groq (Llama 3.3)</div>
                <div className="text-neutral-500 text-[11px]">Rápido e gratuito (1º na fila)</div>
              </div>
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center">
                <div className="text-white text-xs font-semibold mb-1">Ollama Local</div>
                <div className="text-neutral-500 text-[11px]">Fallback offline sem limites</div>
              </div>
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center">
                <div className="text-white text-xs font-semibold mb-1">DeepSeek / Cloudflare</div>
                <div className="text-neutral-500 text-[11px]">Redundância de segurança</div>
              </div>
            </div>
          </div>
        ) : (
          /* PAINEL DE RESULTADOS COM VISUALIZAÇÃO DE FAILOVER */
          <div className="space-y-6 animate-fade-in">
            {/* Banner de Failover Caso Tenha Ocorrido */}
            {report.failoverOccurred && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong>Failover Automático Acionado:</strong> O provedor anterior falhou (rate limit ou timeout). 
                    A auditoria foi finalizada com sucesso via <strong>{report.providerUsed}</strong>.
                  </span>
                </div>
                {report.routingLogs && (
                  <button
                    onClick={() => setShowRoutingLogs(!showRoutingLogs)}
                    className="underline text-[11px] text-amber-400 hover:text-amber-200 ml-4 shrink-0"
                  >
                    {showRoutingLogs ? "Ocultar rota" : "Ver rota detalhada"}
                  </button>
                )}
              </div>
            )}

            {/* Painel de Roteamento de IA Expansível */}
            {(showRoutingLogs || !report.failoverOccurred) && report.routingLogs && report.routingLogs.length > 0 && (
              <div className="p-4 rounded-2xl bg-neutral-900/60 border border-white/[0.08] text-xs">
                <div className="flex items-center justify-between mb-3 text-neutral-400 font-mono text-[11px]">
                  <span className="flex items-center gap-1.5 text-white">
                    <Activity className="w-3.5 h-3.5 text-blue-400" />
                    Trilha de Execução do Roteador de IA
                  </span>
                  <span>{report.routingLogs.length} tentativa(s)</span>
                </div>
                <div className="space-y-2">
                  {report.routingLogs.map((log, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-xl bg-black/40 border border-white/[0.04]"
                    >
                      <div className="flex items-center gap-2">
                        {log.status === "success" ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-red-400" />
                        )}
                        <span className="text-white font-medium">{log.providerName}</span>
                        <span className="text-neutral-500 font-mono text-[10px]">({log.model})</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {log.error && (
                          <span className="text-red-400 text-[11px] truncate max-w-xs">{log.error}</span>
                        )}
                        <span className="text-neutral-400 font-mono">{log.durationMs}ms</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Barra de Ações Superior */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
              <div>
                <span className="text-xs text-neutral-400 font-mono tracking-wider">AUDITORIA CONCLUÍDA</span>
                <h2 className="text-2xl font-semibold text-white tracking-tight">Resultado da Análise</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReport(null);
                  setSelectedFile(null);
                  setRepoUrl("");
                }}
                className="apple-pill-btn px-4 py-2 rounded-xl text-xs font-medium text-white flex items-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Nova Auditoria
              </button>
            </div>

            {/* Score & Resumo */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="glass-panel rounded-3xl p-6 flex flex-col items-center justify-center text-center">
                <span className="text-xs text-neutral-400 font-medium mb-3">SECURITY SCORE</span>
                <div
                  className={`text-6xl font-bold tracking-tighter ${
                    report.score >= 80
                      ? "text-emerald-400"
                      : report.score >= 50
                      ? "text-amber-400"
                      : "text-red-400"
                  }`}
                >
                  {report.score}
                </div>
                <span className="text-xs text-neutral-400 mt-2">de 100 pontos</span>
              </div>

              <div className="glass-panel rounded-3xl p-6 md:col-span-2 flex flex-col justify-between">
                <div>
                  <span className="text-xs text-neutral-400 font-mono">DIAGNÓSTICO EXECUTIVO</span>
                  <p className="text-sm text-neutral-300 mt-2 leading-relaxed whitespace-pre-line">
                    {report.summary}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-6 pt-4 border-t border-white/[0.08] text-xs text-neutral-400">
                  <span>Provedor: <strong className="text-white">{report.providerUsed}</strong></span>
                  <span>•</span>
                  <span>Modelo: <strong className="text-white">{report.modelUsed}</strong></span>
                  <span>•</span>
                  <span>Arquivos: <strong className="text-white">{report.auditedFilesCount}</strong></span>
                </div>
              </div>
            </div>

            {/* Métricas por Severidade */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-neutral-900/60 border border-white/[0.08] flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-neutral-400">Críticas</div>
                  <div className="text-2xl font-semibold text-red-400">{report.criticalCount}</div>
                </div>
                <XCircle className="w-5 h-5 text-red-400 opacity-80" />
              </div>
              <div className="p-4 rounded-2xl bg-neutral-900/60 border border-white/[0.08] flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-neutral-400">Altas</div>
                  <div className="text-2xl font-semibold text-amber-400">{report.highCount}</div>
                </div>
                <AlertTriangle className="w-5 h-5 text-amber-400 opacity-80" />
              </div>
              <div className="p-4 rounded-2xl bg-neutral-900/60 border border-white/[0.08] flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-neutral-400">Médias</div>
                  <div className="text-2xl font-semibold text-yellow-400">{report.mediumCount}</div>
                </div>
                <AlertTriangle className="w-5 h-5 text-yellow-400 opacity-80" />
              </div>
              <div className="p-4 rounded-2xl bg-neutral-900/60 border border-white/[0.08] flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-neutral-400">Baixas / Info</div>
                  <div className="text-2xl font-semibold text-blue-400">{report.lowCount}</div>
                </div>
                <CheckCircle2 className="w-5 h-5 text-blue-400 opacity-80" />
              </div>
            </div>

            {/* Lista Detalhada de Vulnerabilidades */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white tracking-tight">
                  Vulnerabilidades Identificadas ({filteredIssues?.length || 0})
                </h3>
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-neutral-900/70 border border-white/[0.08] text-xs">
                  {["all", "critical", "high", "medium", "low"].map((sev) => (
                    <button
                      key={sev}
                      onClick={() => setSelectedSeverity(sev)}
                      className={`px-3 py-1 rounded-lg capitalize transition-all ${
                        selectedSeverity === sev
                          ? "bg-white text-black font-semibold"
                          : "text-neutral-400 hover:text-white"
                      }`}
                    >
                      {sev === "all" ? "Todas" : sev}
                    </button>
                  ))}
                </div>
              </div>

              {filteredIssues && filteredIssues.length === 0 ? (
                <div className="p-12 text-center rounded-3xl border border-white/[0.08] bg-white/[0.02]">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3 opacity-90" />
                  <h4 className="text-white font-medium">Nenhum apontamento nesta categoria</h4>
                  <p className="text-xs text-neutral-400 mt-1">O código está em conformidade com as regras checadas.</p>
                </div>
              ) : (
                filteredIssues?.map((issue) => {
                  const isExpanded = expandedIssueId === issue.id;
                  const severityColors = {
                    critical: "bg-red-500/10 text-red-400 border-red-500/20",
                    high: "bg-amber-500/10 text-amber-400 border-amber-500/20",
                    medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
                    low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
                    info: "bg-neutral-500/10 text-neutral-400 border-neutral-500/20",
                  };

                  return (
                    <div
                      key={issue.id}
                      className="glass-panel glass-panel-interactive rounded-2xl p-5 cursor-pointer"
                      onClick={() => setExpandedIssueId(isExpanded ? null : issue.id)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border shrink-0 ${
                              severityColors[issue.severity]
                            }`}
                          >
                            {issue.severity}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-semibold text-white tracking-tight">{issue.title}</h4>
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.06] text-neutral-400">
                                {issue.category}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-neutral-400 font-mono">
                              <FileCode className="w-3.5 h-3.5 text-neutral-500" />
                              <span>{issue.file}</span>
                              {issue.line && <span>(Linha {issue.line})</span>}
                            </div>
                          </div>
                        </div>

                        <div className="text-neutral-400">
                          {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div
                          className="mt-5 pt-4 border-t border-white/[0.08] space-y-4 animate-fade-in"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div>
                            <span className="text-xs font-semibold text-neutral-300">Diagnóstico:</span>
                            <p className="text-xs text-neutral-400 mt-1 leading-relaxed">{issue.description}</p>
                          </div>

                          <div>
                            <span className="text-xs font-semibold text-emerald-400">Recomendação de Correção:</span>
                            <p className="text-xs text-neutral-300 mt-1 leading-relaxed">{issue.recommendation}</p>
                          </div>

                          {issue.remediatedCodeSnippet && (
                            <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-black/60">
                              <div className="px-4 py-2 bg-neutral-900/60 border-b border-white/[0.08] flex items-center justify-between text-xs text-neutral-400">
                                <span className="font-mono">Código Remediado Sugerido</span>
                                <button
                                  type="button"
                                  onClick={() => copySnippet(issue.id, issue.remediatedCodeSnippet!)}
                                  className="hover:text-white flex items-center gap-1.5 transition-colors"
                                >
                                  {copiedSnippetId === issue.id ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      <span className="text-emerald-400">Copiado</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5" />
                                      <span>Copiar</span>
                                    </>
                                  )}
                                </button>
                              </div>
                              <pre className="p-4 text-xs font-mono text-neutral-200 overflow-x-auto leading-relaxed">
                                <code>{issue.remediatedCodeSnippet}</code>
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-white/[0.08] py-8 text-center text-xs text-neutral-500 z-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 Auditoria de Segurança. Resiliência Multi-IA & Cloudflare Edge.</p>
          <div className="flex items-center gap-4 text-neutral-400">
            <span>Failover Engine</span>
            <span>•</span>
            <span>Security-Audit Skill</span>
            <span>•</span>
            <span>Cloudflare Workers</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
