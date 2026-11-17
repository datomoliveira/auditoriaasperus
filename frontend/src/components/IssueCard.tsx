import { useState, type MouseEvent } from "react";
import type { SecurityIssue } from "../types";
import { SEVERITY_META } from "../lib/severity";
import { cn } from "../lib/cn";

interface IssueCardProps {
  issue: SecurityIssue;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}

/**
 * Achado como linha de dossiê — sem card, sem sombra, sem borda colorida grossa.
 * A estrutura vem de réguas finas; a cor de severidade é uma marca de 10px.
 * O detalhe fica sempre no DOM: oculto na tela quando recolhido, sempre visível
 * na impressão (o relatório em PDF abre todos os achados).
 */
export function IssueCard({ issue, index, expanded, onToggle }: IssueCardProps) {
  const [copied, setCopied] = useState(false);
  const meta = SEVERITY_META[issue.severity];

  const copy = (e: MouseEvent) => {
    e.stopPropagation();
    if (!issue.remediatedCodeSnippet) return;
    navigator.clipboard.writeText(issue.remediatedCodeSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <article className="rule print-avoid">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="group flex w-full items-start gap-4 py-5 text-left"
      >
        <span className="data-label tabular mt-1 shrink-0">
          {String(index + 1).padStart(2, "0")}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="inline-flex shrink-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 translate-y-[1px]"
                style={{ background: meta.color }}
                aria-hidden="true"
              />
              <span className="data-label" style={{ color: meta.color }}>
                {meta.label}
              </span>
            </span>
            <span className="display text-[17px] leading-snug text-bone transition-colors group-hover:text-white">
              {issue.title}
            </span>
          </span>

          <span className="data-label mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-bone-dim normal-case tracking-normal">
              {issue.file}
              {issue.line != null ? `:${issue.line}` : ""}
            </span>
            <span aria-hidden="true">/</span>
            <span>{issue.id}</span>
            <span aria-hidden="true">/</span>
            <span>{issue.category}</span>
          </span>
        </span>

        <span className="mt-0.5 flex shrink-0 items-center gap-2 text-bone-faint transition-colors group-hover:text-bone-dim">
          <span className="no-print hidden sm:inline">{expanded ? "recolher" : "detalhar"}</span>
          <span className="display w-4 text-center text-[16px] leading-none">
            {expanded ? "−" : "+"}
          </span>
        </span>
      </button>

      <div className={cn("pb-8 pl-[calc(2ch+1rem)]", expanded ? "block" : "hidden", "print:block")}>
        <div className="grid gap-x-12 gap-y-6 sm:grid-cols-2">
          <div>
            <span className="data-label">diagnóstico</span>
            <p className="mt-2 max-w-measure text-[13.5px] leading-relaxed text-bone-dim">
              {issue.description}
            </p>
          </div>
          <div>
            <span className="data-label" style={{ color: "var(--signal)" }}>
              recomendação
            </span>
            <p className="mt-2 max-w-measure text-[13.5px] leading-relaxed text-bone-dim">
              {issue.recommendation}
            </p>
          </div>
        </div>

        {issue.remediatedCodeSnippet && (
          <div className="mt-7 border border-rule-strong print-code">
            <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
              <span className="data-label">patch de correção</span>
              <button
                type="button"
                onClick={copy}
                className="no-print data-label flex items-center gap-2 transition-colors hover:text-bone"
              >
                {copied ? (
                  <span style={{ color: "var(--signal)" }}>✓ copiado</span>
                ) : (
                  <span>copiar</span>
                )}
              </button>
            </div>
            <pre className="max-h-[420px] overflow-auto p-4 font-mono text-[12px] leading-relaxed text-bone-dim">
              <code>{issue.remediatedCodeSnippet}</code>
            </pre>
          </div>
        )}
      </div>
    </article>
  );
}

export default IssueCard;
