import type { Severity } from "../types";

/**
 * Rampa de severidade — proposital e contida, dentro do mundo tinta+osso.
 * A cor é informação (medição), não decoração: aparece em marcas pequenas.
 */
export const SEVERITY_META: Record<
  Severity,
  { label: string; short: string; color: string; rank: number }
> = {
  critical: { label: "Crítica", short: "CRIT", color: "#FF4D2E", rank: 0 },
  high: { label: "Alta", short: "HIGH", color: "#FF8A3D", rank: 1 },
  medium: { label: "Média", short: "MED", color: "#F2C14E", rank: 2 },
  low: { label: "Baixa", short: "LOW", color: "#9BB0C9", rank: 3 },
  info: { label: "Info", short: "INFO", color: "#8A877F", rank: 4 },
};

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

export function severityColor(sev: Severity) {
  return SEVERITY_META[sev]?.color ?? "#8A877F";
}
