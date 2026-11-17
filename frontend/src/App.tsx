import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { MarkAlert, MarkExport, MarkLogo, MarkReset } from "./components/Marks";
import type { AuditReport, Severity, SourceTab } from "./types";
import { demoReport } from "./data/demoReport";
import { SEVERITY_META, SEVERITY_ORDER } from "./lib/severity";
import { cn } from "./lib/cn";
import { collectDroppedEntries, entriesFromFileList, zipEntries, type UploadEntry } from "./lib/upload";
import Intro from "./components/Intro";
import AuditConsole from "./components/AuditConsole";
import ScanningOverlay from "./components/ScanningOverlay";
import ScoreReadout from "./components/ScoreReadout";
import SeverityBreakdown from "./components/SeverityBreakdown";
import IssueCard from "./components/IssueCard";

// three.js é pesado: a cena 3D entra sob demanda, fora do bundle inicial.
const Scene3D = lazy(() => import("./components/Scene3D"));

// Endereço do backend. Em desenvolvimento local (Vite), ele roda separado na
// porta 8787. Publicado no Cloudflare Pages, o backend vive no MESMO domínio
// (via Pages Functions), então usamos caminhos relativos — funciona igual no
// celular, sem configurar nada.
const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (["5173", "4173"].includes(window.location.port)
    ? `${window.location.protocol}//${window.location.hostname}:8787`
    : "");

const CAPABILITIES = [
  {
    title: "Encontra falhas de segurança",
    body: "Procura os problemas mais comuns que deixam um sistema aberto para invasores — como brechas de login e dados acessíveis por engano.",
  },
  {
    title: "Acha senhas e chaves expostas",
    body: "Detecta senhas, chaves de acesso e outros segredos que ficaram à mostra no código. Se vazarem, podem dar acesso total ao seu sistema.",
  },
  {
    title: "Avisa sobre programas desatualizados",
    body: "Aponta bibliotecas antigas com falhas já conhecidas e ajustes de segurança que estão faltando no seu projeto.",
  },
  {
    title: "Diz como corrigir",
    body: "Para cada problema, mostra em palavras simples o que está errado e como resolver — com a correção já pronta para usar.",
  },
];

const PROCESS = [
  {
    title: "Você envia seu projeto",
    body: "É só mandar a pasta do seu projeto (ou o arquivo .zip dela). Ele fica guardado em um espaço separado e é apagado assim que a análise termina.",
  },
  {
    title: "A análise acontece",
    body: "Uma inteligência artificial lê o seu código e procura os pontos fracos que um invasor poderia aproveitar.",
  },
  {
    title: "Você recebe o resultado",
    body: "Uma nota de segurança, a lista de problemas por gravidade e como corrigir cada um. Dá para salvar tudo em PDF.",
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
  const [isPreparing, setIsPreparing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);

  const handleIntroDone = useCallback(() => setIntroDone(true), []);

  // Deep-links: ?intro=0 (pula a intro) e ?demo=1 (abre o relatório de exemplo).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("intro") === "0" || params.has("demo")) setIntroDone(true);
    if (params.has("demo")) setReport({ ...demoReport, timestamp: new Date().toISOString() });
  }, []);

  // Consulta o roteador de IA no backend (indicador do cabeçalho).
  // Roda ao abrir, a cada 12s e ao voltar o foco para a aba — assim o aviso
  // se recupera sozinho depois de um reinício do servidor, sem recarregar.
  useEffect(() => {
    let alive = true;

    const checkHealth = async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      try {
        const r = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal });
        if (!r.ok) throw new Error("offline");
        const data = await r.json();
        if (!alive) return;
        setHealth({
          online: true,
          provider: data?.primaryProvider ?? null,
          count: Number(data?.providersCount ?? 0),
        });
      } catch {
        if (alive) setHealth({ online: false, provider: null, count: 0 });
      } finally {
        clearTimeout(timer);
      }
    };

    void checkHealth();
    const interval = window.setInterval(checkHealth, 12000);
    const recheck = () => void checkHealth();
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);

    return () => {
      alive = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, []);

  /* ---------------------------------------------------------------- upload */
  // Recebe uma pasta inteira ou vários arquivos: compacta tudo em um .zip no
  // próprio navegador e envia como um único arquivo — sem o usuário precisar
  // compactar nada à mão.
  const acceptEntries = async (entries: UploadEntry[]) => {
    if (entries.length === 0) return;
    setErrorMsg(null);

    // Um único arquivo .zip já pronto: envia direto.
    if (entries.length === 1 && entries[0].path.toLowerCase().endsWith(".zip")) {
      setSelectedFile(entries[0].file);
      return;
    }

    setIsPreparing(true);
    try {
      const first = entries[0]?.path ?? "projeto";
      const root = first.split("/")[0].replace(/\.zip$/i, "") || "projeto";
      const zipped = await zipEntries(entries, `${root}.zip`);
      setSelectedFile(zipped);
    } catch {
      setErrorMsg("Não foi possível preparar os arquivos. Tente escolher a pasta novamente.");
    } finally {
      setIsPreparing(false);
    }
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.name.toLowerCase().endsWith(".zip")) {
        setSelectedFile(file);
        setErrorMsg(null);
      } else {
        setErrorMsg("Escolha um arquivo .zip ou use o botão “Escolher pasta”.");
      }
    }
    e.target.value = "";
  };

  const onFolderChange = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (list && list.length) void acceptEntries(entriesFromFileList(list));
    e.target.value = "";
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!e.dataTransfer) return;
    const entries = await collectDroppedEntries(e.dataTransfer);
    await acceptEntries(entries);
  };

  /* ----------------------------------------------------------------- audit */
  const startAudit = async () => {
    setIsAuditing(true);
    setErrorMsg(null);
    setReport(null);

    const stages = [
      "Criando um espaço seguro",
      "Procurando falhas conhecidas",
      "Procurando senhas e chaves expostas",
      "Preparando as correções",
    ];

    try {
      for (const s of stages.slice(0, 2)) {
        setProgressStage(s);
        await new Promise((r) => setTimeout(r, 550));
      }
      setProgressStage(stages[2]);

      let res: Response;
      if (activeTab === "zip") {
        if (!selectedFile) throw new Error("Escolha primeiro a pasta (ou o arquivo .zip) do seu projeto.");
        const formData = new FormData();
        formData.append("file", selectedFile);
        res = await fetch(`${API_BASE_URL}/api/audit/zip`, { method: "POST", body: formData });
      } else {
        if (!repoUrl) throw new Error("Cole primeiro o link do seu projeto.");
        res = await fetch(`${API_BASE_URL}/api/audit/url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: repoUrl }),
        });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Não foi possível concluir a verificação (erro ${res.status}).`);
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
        err instanceof Error ? err.message : "Algo deu errado ao fazer a verificação.";
      setErrorMsg(`${message} Confira se o servidor está ligado ou clique em “ver um exemplo”.`);
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
    document.title = `relatorio-de-seguranca-${stamp}`;
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
    if (!health) return { text: "verificando…", color: "var(--bone-faint)" };
    if (!health.online) return { text: "servidor fora do ar", color: "var(--sev-critical)" };
    if (health.count === 0) return { text: "sem IA conectada", color: "var(--sev-medium)" };
    // Nunca revelamos qual IA está por trás — apenas que a verificação está pronta.
    return { text: "verificação pronta", color: "var(--signal)" };
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
            <span className="data-label hidden sm:inline">verificação de segurança</span>
          </button>

          {!report && (
            <nav className="hidden items-center gap-7 md:flex">
              {[
                { href: "#capacidades", label: "o que faz" },
                { href: "#processo", label: "como funciona" },
                { href: "#console", label: "testar agora" },
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
                  Salvar em PDF
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="btn-line flex items-center gap-2 px-4 py-2 text-[12px]"
                >
                  <MarkReset className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Nova verificação</span>
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
                  <span>versão 2.0</span>
                  <span>análise por inteligência artificial</span>
                  <span>seu código não fica guardado</span>
                </div>

                <h1
                  className="animate-rise display mt-10 max-w-[16ch] text-[2.75rem] leading-[1.03] sm:text-[4rem]"
                  style={{ animationDelay: "80ms" }}
                >
                  Descubra as falhas de segurança do seu sistema antes que alguém as encontre.
                </h1>

                <p
                  className="animate-rise mt-8 max-w-measure text-[16px] leading-relaxed text-bone-dim"
                  style={{ animationDelay: "160ms" }}
                >
                  É simples: você envia a pasta do seu projeto (ou o .zip dela) e o Sentinel procura, com
                  inteligência artificial, os pontos fracos que um invasor poderia usar. No fim,
                  você recebe uma nota, uma lista do que está errado e o passo a passo para
                  corrigir — tudo pronto para salvar em PDF.
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
                    Verificar meu projeto
                  </button>
                  <button
                    type="button"
                    onClick={loadDemo}
                    className="data-label link-underline hover:text-bone"
                  >
                    ver um exemplo de resultado
                  </button>
                </div>
              </div>
            </section>

            {/* capacidades */}
            <section id="capacidades" className="scroll-mt-20">
              <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-12 lg:px-8">
                <div className="lg:col-span-4">
                  <span className="data-label">01 / o que faz</span>
                  <h2 className="display mt-4 text-[2rem] leading-tight">
                    O que a verificação encontra
                  </h2>
                  <p className="mt-4 max-w-measure text-[14px] leading-relaxed text-bone-dim">
                    Tudo explicado em linguagem simples, para você entender e resolver rápido.
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
                  <span className="data-label">02 / como funciona</span>
                  <h2 className="display mt-4 text-[2rem] leading-tight">Do envio ao resultado</h2>

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
                  <span className="data-label">03 / testar agora</span>
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
                      folderInputRef={folderInputRef}
                      isPreparing={isPreparing}
                      onFileChange={onFileChange}
                      onFolderChange={onFolderChange}
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
                      Nenhuma inteligência artificial conectada ainda. Peça para colocar a chave de
                      acesso no arquivo <code className="text-bone-dim">.env</code> para fazer
                      verificações de verdade.
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
                <span className="data-label">resultado da verificação</span>
                <h1 className="display mt-3 text-[2.25rem] leading-tight sm:text-[2.75rem]">
                  Veja o que encontramos
                </h1>
              </div>
              <div className="no-print flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={exportPdf}
                  className="btn-solid flex items-center gap-2 px-5 py-2.5 text-[12.5px]"
                >
                  <MarkExport className="h-4 w-4" />
                  Salvar em PDF
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="btn-line flex items-center gap-2 px-5 py-2.5 text-[12.5px]"
                >
                  <MarkReset className="h-4 w-4" />
                  Nova verificação
                </button>
              </div>
            </div>

            {/* metadados */}
            <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-5 border-t border-rule pt-6 sm:grid-cols-3">
              {[
                { k: "quando", v: new Date(report.timestamp).toLocaleString("pt-BR") },
                { k: "arquivos analisados", v: String(report.auditedFilesCount) },
                { k: "problemas encontrados", v: String(report.totalIssues) },
              ].map((m) => (
                <div key={m.k}>
                  <dt className="data-label">{m.k}</dt>
                  <dd className="data-value mt-1.5">{m.v}</dd>
                </div>
              ))}
            </dl>

            {/* score + severidade */}
            <div className="mt-14 grid gap-12 lg:grid-cols-12">
              <div className="lg:col-span-6">
                <span className="data-label">nota de segurança</span>
                <div className="mt-5">
                  <ScoreReadout score={report.score} />
                </div>
              </div>

              <div className="lg:col-span-6">
                <span className="data-label">problemas por gravidade</span>
                <div className="mt-4">
                  <SeverityBreakdown report={report} active={filter} onSelect={setFilter} />
                </div>
              </div>
            </div>

            {/* resumo */}
            <div className="mt-14 border-t border-rule pt-8">
              <span className="data-label">resumo geral</span>
              <p className="mt-4 max-w-measure text-[15px] leading-relaxed text-bone-dim">
                {report.summary}
              </p>
            </div>

            {/* achados */}
            <div className="mt-14">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <span className="data-label">problemas encontrados</span>
                  <h2 className="display mt-2 text-[1.75rem] leading-tight">Lista de problemas</h2>
                </div>

                <div className="no-print flex flex-wrap items-center gap-x-5 gap-y-2">
                  {(["all", ...SEVERITY_ORDER] as const).map((sev) => {
                    const isAll = sev === "all";
                    const active = filter === sev;
                    const label = isAll ? "Todos" : SEVERITY_META[sev].label;
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
                    Nenhum problema deste tipo por aqui.
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
              Relatório gerado automaticamente pelo Sentinel. Como toda análise automática, vale a
              pena a revisão de um profissional antes de tomar decisões importantes.
            </p>
          </div>
        )}
      </main>

      {/* ------------------------------------------------------------ footer */}
      <footer className="no-print border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <span className="data-label">
            Sentinel · {new Date().getFullYear()} · verificação de segurança
          </span>
          <span className="data-label">seu projeto é analisado e apagado em seguida</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
