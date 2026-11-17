import type { ProviderAttemptLog } from "../types";

interface RoutingLogProps {
  logs?: ProviderAttemptLog[];
  failoverOccurred?: boolean;
  providerUsed?: string;
}

export function RoutingLog({ logs, failoverOccurred, providerUsed }: RoutingLogProps) {
  if (!logs || logs.length === 0) {
    return (
      <div>
        <span className="data-label">rota de ia</span>
        <p className="data-value mt-2">{providerUsed ?? "não configurada"}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="data-label">rota de ia</span>
        <span className="data-label" style={{ color: failoverOccurred ? "#F2C14E" : undefined }}>
          {failoverOccurred ? "failover" : "rota primária"}
        </span>
      </div>

      <ul className="mt-3">
        {logs.map((log, i) => (
          <li key={i} className="rule first:border-t-0">
            <div className="flex items-baseline gap-3 py-2.5">
              <span className="data-label tabular">{String(i + 1).padStart(2, "0")}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-bone">{log.providerName}</p>
                <p className="data-label mt-1 truncate">{log.model}</p>
                {log.error && (
                  <p className="mt-1 truncate font-mono text-[11px] text-sev-critical/90">{log.error}</p>
                )}
              </div>
              <div className="text-right">
                <span
                  className="data-label"
                  style={{ color: log.status === "success" ? undefined : "#FF4D2E" }}
                >
                  {log.status === "success" ? "ok" : "falha"}
                </span>
                <p className="data-value mt-1 tabular">{log.durationMs}ms</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default RoutingLog;
