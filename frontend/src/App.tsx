import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { MarkAlert, MarkExport, MarkLogo, MarkReset } from "./components/Marks";
import type { AuditReport, Severity, SourceTab } from "./types";
import { demoReport } from "./data/demoReport";
import { SEVERITY_META, SEVERITY_ORDER } from "./lib/severity";
import { cn } from "./lib/cn";
import Intro from "./components/Intro";
import AuditConsole from "./components/AuditConsole";
import ScanningOverlay from "./components/ScanningOverlay";
import ScoreReadout from "./components/ScoreReadout";
import SeverityBreakdown from "./components/SeverityBreakdown";
import RoutingLog from "./components/RoutingLog";
import IssueCard from "./components/IssueCard";

// three.js é pesado: a cena 3D entra sob demanda, fora do bundle inicial.
const Scene3D = lazy(() => import("./components/Scene3D"));

// Aponta para o mesmo host que serviu a página (localhost no desktop, IP da
// rede no celular). Assim o backend responde tanto em localhost quanto via LAN.
const API_BASE_URL =
  (import.meta.env?.VITE_API_BASE_URL as string | undefined) ||
  `${window.location.protocol}//${window.location.hostname}:8787`;

const CAPABILITIES = [
  {
    title: "Análise estática OWASP",
    body: "Varredura de injeções, XSS, SSRF e quebra de autorização nas rotas e nos fluxos de dados.",
  },
  {
    title: "Detector de segredos",
    body: "Encontra chaves de API, tokens e senhas expostos — inclusive no bundle entregue ao cliente.",
  },
  {
    title: "Dependências e configuração",
    body: "Audita versões vulneráveis, CORS, CSP e cabeçalhos de segurança ausentes.",
  },
  {
    title: "Patches de correção",
    body: "Cada achado vem com a correção sugerida, pronta para copiar e commitar.",
  },
];

const PROCESS = [
  {
    title: "Isolamento",
    body: "O projeto entra em uma sandbox descartável e é descartado ao fim da varredura.",
  },
  {
    title: "Auditoria por IA",
    body: "Um roteador multi-provedor, com failover automático, analisa o código.",
  },
  {
    title: "Dossiê",
    body: "Pontuação, severidades, patches e rota de IA registrados em um relatório exportável.",
  },
];

interface HealthState {
  online: boolean;
  provider: string | null;
  count: number;
}

export function App() {
  const [introDone, setIntroDone] = useState(false);
  const [activeTab, setActiveTab] = useState<SourceTab>("zip");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [progressStage, setProgressStage] = useState("");
  const [report, setReport] = useState<AuditReport | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<Severity | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthState | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);

  const handleIntroDone = useCallback(() => setIntroDone(true), []);

  // Deep-links: ?intro=0 (pula a intro) e ?demo=1 (abre o relatório de exemplo).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("intro") === "0" || params.has("demo")) setIntroDone(true);
    if (params.has("demo")) setReport({ ...demoReport, timestamp: new Date().toISOString() });
  }, []);

  // Consulta o roteador de IA no backend (indicador do cabeçalho).
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    fetch(`${API_BASE_URL}/health`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("offline"))))
      .then((data) =>
        alive &&
        setHealth({
          online: true,
          provider: data?.primaryProvider ?? null,
          count: Number(data?.providersCount ?? 0),
        }),
      )
      .catch(() => alive && setHealth({ online: false, provider: null, count: 0 }))
      .finally(() => clearTimeout(timer));
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  /* ---------------------------------------------------------------- upload */
  const acceptFile = (file?: File) => {
    if (!file) return;
    if (file.name.toLowerCase().endsWith(".zip")) {
      setSelectedFile(file);
      setErrorMsg(null);
    } else {
      setErrorMsg("Formato inválido — envie um arquivo .zip do projeto.");
    }
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => acceptFile(e.target.files?.[0]);
  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    acceptFile(e.dataTransfer.files?.[0]);
  };

  /* ----------------------------------------------------------------- audit */
  const startAudit = async () => {
    setIsAuditing(true);
    setErrorMsg(null);
    setReport(null);

    const stages = [
      "Isolando repositório em sandbox",
      "Análise estática · OWASP Top 10",
      "Detecção de segredos e dependências",
      "Gerando patches de correção",
    ];

    try {
      for (const s of stages.slice(0, 2)) {
        setProgressStage(s);
        await new Promise((r) => setTimeout(r, 550));
      }
      setProgressStage(stages[2]);

      let res: Response;
      if (activeTab === "zip") {
        if (!selectedFile) throw new Error("Selecione um arquivo .zip primeiro.");
        const formData = new FormData();
        formData.append("file", selectedFile);
        res = await fetch(`${API_BASE_URL}/api/audit/zip`, { method: "POST", body: formData });
      } else {
        if (!repoUrl) throw new Error("Informe a URL do repositório Git.");
        res = await fetch(`${API_BASE_URL}/api/audit/url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: repoUrl }),
        });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro HTTP ${res.status} ao processar a auditoria.`);
      }

      setProgressStage(stages[3]);
      const data: AuditReport = await res.json();
      await new Promise((r) => setTimeout(r, 400));
      setReport(data);
      setFilter("all");
      setExpandedId(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro inesperado ao executar a auditoria.";
      setErrorMsg(`${message} — verifique o backend em ${API_BASE_URL}, ou use a demonstração.`);
    } finally {
      setIsAuditing(false);
      setProgressStage("");
    }
  };

  const loadDemo = () => {
    setErrorMsg(null);
    setReport({ ...demoReport, timestamp: new Date().toISOString() });
    setFilter("all");
    setExpandedId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const reset = () => {
    setReport(null);
    setSelectedFile(null);
    setRepoUrl("");
    setErrorMsg(null);
    setFilter("all");
    setExpandedId(null);
  };

  const exportPdf = () => {
    if (!report) return;
    const previous = document.title;
    const stamp = new Date(report.timestamp).toISOString().slice(0, 10);
    document.title = `auditoria-sentinel-${stamp}`;
    // O stylesheet de impressão abre todos os achados e remove o cromo da tela.
    window.print();
    document.title = previous;
  };

  /* ---------------------------------------------------------------- derived */
  const issues = useMemo(() => {
    if (!report) return [];
    return [...report.issues]
      .sort((a, b) => SEVERITY_META[a.severity].rank - SEVERITY_META[b.severity].rank)
      .filter((i) => filter === "all" || i.severity === filter);
  }, [report, filter]);

  const counts = useMemo(() => {
    const base: Record<Severity | "all", number> = {
      all: report?.issues.length ?? 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    report?.issues.forEach((i) => (base[i.severity] += 1));
    return base;
  }, [report]);

  const scrollToConsole = () =>
    consoleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  /* ------------------------------------------------------------ ai status */
  const aiStatus = (() => {
    if (!health) return { text: "verificando", color: "var(--bone-faint)" };
    if (!health.online) return { text: "backend offline", color: "var(--sev-critical)" };
    if (health.count === 0) return { text: "IA não configurada", color: "var(--sev-medium)" };
    return { text: health.provider ?? "IA ativa", color: "var(--signal)" };
  })();

  /* ------------------------------------------------------------------- view */
  return (
    <div className="min-h-screen bg-ink font-sans text-bone">
      {!introDone && <Intro onDone={handleIntroDone} />}
      {isAuditing && <ScanningOverlay stage={progressStage} />}

      {/* ------------------------------------------------------------ header */}
      <header className="no-print sticky top-0 z-50 border-b border-rule bg-ink/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-6 lg:px-8">
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-3 text-left"
            aria-label="Início"
          >
            <MarkLogo className="h-[18px] w-[18px] text-signal" />
            <span className="display text-[17px] tracking-tight">Sentinel</span>
            <span className="data-label hidden sm:inline">auditoria de segurança</span>
          </button>

          {!report && (
            <nav className="hidden items-center gap-7 md:flex">
              {[
                { href: "#capacidades", label: "capacidades" },
                { href: "#processo", label: "processo" },
                { href: "#console", label: "executar" },
              ].map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="data-label transition-colors hover:text-bone"
                >
                  {l.label}
                </a>
              ))}
            </nav>
          )}

          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-2 sm:flex">
              <span
                className={cn("h-1.5 w-1.5 rounded-full", health?.online && "animate-pulse-soft")}
                style={{ background: aiStatus.color }}
              />
              <span className="data-label">{aiStatus.text}</span>
            </span>

            {report && (
              <>
                <button
                  type="button"
                  onClick={exportPdf}
                  className="btn-solid flex items-center gap-2 px-4 py-2 text-[12px]"
                >
                  <MarkExport className="h-3.5 w-3.5" />
                  Exportar PDF
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="btn-line flex items-center gap-2 px-4 py-2 text-[12px]"
                >
                  <MarkReset className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Nova auditoria</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {!report ? (
          /* ========================================================== LANDING */
          <>
            <section className="relative overflow-hidden border-b border-rule">
              <div className="no-print pointer-events-none absolute inset-0">
                <Suspense fallback={null}>
                  <Scene3D className="h-full w-full" />
                </Suspense>
              </div>

              <div className="relative mx-auto max-w-6xl px-6 py-20 lg:px-8 lg:py-28">
                <div className="animate-rise data-label flex flex-wrap gap-x-8 gap-y-2">
                  <span>v2.0</span>
                  <span>OWASP Top 10</span>
                  <span>roteador de IA multi-provedor</span>
                  <span>sandbox descartável</span>
                </div>

                <h1
                  className="animate-rise display mt-10 max-w-[15ch] text-[2.75rem] leading-[1.03] sm:text-[4rem]"
                  style={{ animationDelay: "80ms" }}
                >
                  Encontre falhas antes que cheguem à produção.
                </h1>

                <p
                  className="animate-rise mt-8 max-w-measure text-[16px] leading-relaxed text-bone-dim"
                  style={{ animationDelay: "160ms" }}
                >
                  O Sentinel audita seu código com IA, mapeia vulnerabilidades, segredos expostos e
                  dependências inseguras — e devolve patches prontos para commit, em um dossiê
                  exportável.
                </p>

                <div
                  className="animate-rise mt-10 flex flex-wrap items-center gap-6"
                  style={{ animationDelay: "240ms" }}
                >
                  <button
                    type="button"
                    onClick={scrollToConsole}
                    className="btn-solid px-6 py-3 text-[13px]"
                  >
                    Executar auditoria
                  </button>
                  <button
                    type="button"
                    onClick={loadDemo}
                    className="data-label link-underline hover:text-bone"
                  >
                    ver demonstração
                  </button>
                </div>
              </div>
            </section>

            {/* capacidades */}
            <section id="capacidades" className="scroll-mt-20">
              <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-12 lg:px-8">
                <div className="lg:col-span-4">
                  <span className="data-label">01 / capacidades</span>
                  <h2 className="display mt-4 text-[2rem] leading-tight">
                    Quatro camadas de análise
                  </h2>
                  <p className="mt-4 max-w-measure text-[14px] leading-relaxed text-bone-dim">
                    Trabalham juntas para reduzir o tempo entre a falha e a correção.
                  </p>
                </div>

                <ul className="lg:col-span-8">
                  {CAPABILITIES.map((c, i) => (
                    <li key={c.title} className="rule flex gap-6 py-6 first:border-t-0">
                      <span className="data-label tabular mt-1 shrink-0">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <h3 className="display text-[18px] leading-snug">{c.title}</h3>
                        <p className="mt-2 max-w-measure text-[13.5px] leading-relaxed text-bone-dim">
                          {c.body}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {/* processo + console */}
            <section id="processo" className="scroll-mt-20 border-t border-rule">
              <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-12 lg:px-8">
                <div className="lg:col-span-5">
                  <span className="data-label">02 / processo</span>
                  <h2 className="display mt-4 text-[2rem] leading-tight">Do upload ao patch</h2>

                  <ol className="mt-8">
                    {PROCESS.map((p, i) => (
                      <li key={p.title} className="rule py-5 first:border-t-0">
                        <span className="data-label tabular">{String(i + 1).padStart(2, "0")}</span>
                        <h3 className="display mt-2 text-[17px] leading-snug">{p.title}</h3>
                        <p className="mt-1.5 max-w-measure text-[13.5px] leading-relaxed text-bone-dim">
                          {p.body}
                        </p>
                      </li>
                    ))}
                  </ol>
                </div>

                <div id="console" ref={consoleRef} className="scroll-mt-20 lg:col-span-7">
                  <span className="data-label">03 / executar</span>
                  <div className="mt-4">
                    <AuditConsole
                      activeTab={activeTab}
                      onTabChange={setActiveTab}
                      selectedFile={selectedFile}
                      repoUrl={repoUrl}
                      isDragging={isDragging}
                      errorMsg={errorMsg}
                      isAuditing={isAuditing}
                      progressStage={progressStage}
                      fileInputRef={fileInputRef}
                      onFileChange={onFileChange}
                      onDragOver={onDragOver}
                      onDragLeave={onDragLeave}
                      onDrop={onDrop}
                      onRepoUrlChange={setRepoUrl}
                      onRun={startAudit}
                      onDemo={loadDemo}
                    />
                  </div>

                  {!health?.count && health?.online && (
                    <p className="mt-5 flex items-start gap-2 text-[12.5px] leading-relaxed text-bone-faint">
                      <MarkAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sev-medium" />
                      Nenhum provedor de IA configurado. Defina as chaves em{" "}
                      <code className="text-bone-dim">.env</code> para rodar auditorias reais.
                    </p>
                  )}
                </div>
              </div>
            </section>
          </>
        ) : (
          /* =========================================================== REPORT */
          <div className="mx-auto max-w-6xl px-6 py-12 lg:px-8 lg:py-16">
            {/* masthead */}
            <div className="rule-strong flex flex-wrap items-start justify-between gap-6 pt-6">
              <div>
                <span className="data-label">relatório de auditoria</span>
                <h1 className="display mt-3 text-[2.25rem] leading-tight sm:text-[2.75rem]">
                  Resultado da varredura
                </h1>
              </div>
              <div className="no-print flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={exportPdf}
                  className="btn-solid flex items-center gap-2 px-5 py-2.5 text-[12.5px]"
                >
                  <MarkExport className="h-4 w-4" />
                  Exportar PDF
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="btn-line flex items-center gap-2 px-5 py-2.5 text-[12.5px]"
                >
                  <MarkReset className="h-4 w-4" />
                  Nova auditoria
                </button>
              </div>
            </div>

            {/* metadados */}
            <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-5 border-t border-rule pt-6 sm:grid-cols-4">
              {[
                { k: "data", v: new Date(report.timestamp).toLocaleString("pt-BR") },
                { k: "arquivos", v: String(report.auditedFilesCount) },
                { k: "achados", v: String(report.totalIssues) },
                { k: "provedor", v: report.providerUsed ?? "—" },
              ].map((m) => (
                <div key={m.k}>
                  <dt className="data-label">{m.k}</dt>
                  <dd className="data-value mt-1.5">{m.v}</dd>
                </div>
              ))}
            </dl>

            {/* score + severidade + rota */}
            <div className="mt-14 grid gap-12 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <span className="data-label">pontuação de segurança</span>
                <div className="mt-5">
                  <ScoreReadout score={report.score} />
                </div>
              </div>

              <div className="lg:col-span-4">
                <span className="data-label">distribuição por severidade</span>
                <div className="mt-4">
                  <SeverityBreakdown report={report} active={filter} onSelect={setFilter} />
                </div>
              </div>

              <div className="lg:col-span-3">
                <RoutingLog
                  logs={report.routingLogs}
                  failoverOccurred={report.failoverOccurred}
                  providerUsed={report.providerUsed}
                />
              </div>
            </div>

            {/* diagnóstico executivo */}
            <div className="mt-14 border-t border-rule pt-8">
              <span className="data-label">diagnóstico executivo</span>
              <p className="mt-4 max-w-measure text-[15px] leading-relaxed text-bone-dim">
                {report.summary}
              </p>
            </div>

            {/* achados */}
            <div className="mt-14">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <span className="data-label">achados</span>
                  <h2 className="display mt-2 text-[1.75rem] leading-tight">Vulnerabilidades</h2>
                </div>

                <div className="no-print flex flex-wrap items-center gap-x-5 gap-y-2">
                  {(["all", ...SEVERITY_ORDER] as const).map((sev) => {
                    const isAll = sev === "all";
                    const active = filter === sev;
                    const label = isAll ? "Todas" : SEVERITY_META[sev].label;
                    return (
                      <button
                        key={sev}
                        type="button"
                        onClick={() => setFilter(sev)}
                        className={cn(
                          "data-label border-b pb-1 transition-colors",
                          active
                            ? "border-signal text-bone"
                            : "border-transparent text-bone-faint hover:text-bone-dim",
                        )}
                      >
                        {label}{" "}
                        <span className="tabular">
                          {String(counts[sev]).padStart(2, "0")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 border-t border-rule-strong">
                {issues.length === 0 ? (
                  <p className="py-14 text-[14px] text-bone-dim">
                    Nenhum apontamento neste nível de severidade.
                  </p>
                ) : (
                  issues.map((issue, i) => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      index={i}
                      expanded={expandedId === issue.id}
                      onToggle={() => setExpandedId(expandedId === issue.id ? null : issue.id)}
                    />
                  ))
                )}
              </div>
            </div>

            <p className="mt-14 border-t border-rule pt-6 text-[11.5px] leading-relaxed text-bone-faint">
              Documento gerado pelo Sentinel. Achados produzidos por análise automatizada —
              recomenda-se revisão humana antes de decisões de segurança.
            </p>
          </div>
        )}
      </main>

      {/* ------------------------------------------------------------ footer */}
      <footer className="no-print border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <span className="data-label">
            Sentinel · {new Date().getFullYear()} · OWASP Top 10
          </span>
          <span className="data-label">sandbox descartável · edge runtime</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
