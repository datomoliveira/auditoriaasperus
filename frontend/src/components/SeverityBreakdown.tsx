import type { AuditReport, Severity } from "../types";
import { SEVERITY_META, SEVERITY_ORDER } from "../lib/severity";

interface SeverityBreakdownProps {
  report: AuditReport;
  active: Severity | "all";
  onSelect: (sev: Severity | "all") => void;
}

export function SeverityBreakdown({ report, active, onSelect }: SeverityBreakdownProps) {
  const counts: Record<Severity, number> = {
    critical: report.criticalCount,
    high: report.highCount,
    medium: report.mediumCount,
    low: report.lowCount,
    info: report.issues.filter((i) => i.severity === "info").length,
  };
  const total = Math.max(1, SEVERITY_ORDER.reduce((sum, s) => sum + counts[s], 0));

  return (
    <div>
      {/* barra de distribuição (medição) */}
      <div className="flex h-1.5 w-full overflow-hidden bg-rule">
        {SEVERITY_ORDER.map((sev) => {
          const pct = (counts[sev] / total) * 100;
          if (pct === 0) return null;
          return (
            <span
              key={sev}
              style={{ width: `${pct}%`, background: SEVERITY_META[sev].color }}
              title={`${SEVERITY_META[sev].label}: ${counts[sev]}`}
            />
          );
        })}
      </div>

      <ul className="mt-4">
        {SEVERITY_ORDER.map((sev) => {
          const meta = SEVERITY_META[sev];
          const count = counts[sev];
          const isActive = active === sev;
          return (
            <li key={sev} className="rule first:border-t-0">
              <button
                type="button"
                onClick={() => onSelect(isActive ? "all" : sev)}
                disabled={count === 0}
                className="group flex w-full items-center gap-3 py-2.5 text-left transition-opacity disabled:opacity-40"
              >
                <span className="h-2.5 w-2.5 shrink-0" style={{ background: meta.color }} />
                <span
                  className={`text-[13px] ${isActive ? "text-bone" : "text-bone-dim group-hover:text-bone"}`}
                >
                  {meta.label}
                </span>
                {isActive && <span className="data-label text-signal">selecionado</span>}
                <span className="data-value ml-auto tabular">{String(count).padStart(2, "0")}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default SeverityBreakdown;
