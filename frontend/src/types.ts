export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type IssueCategory =
  | "Injection"
  | "Auth & Access"
  | "Secrets Leak"
  | "Config / Insecure Deps"
  | "Code Quality";

export interface SecurityIssue {
  id: string;
  severity: Severity;
  title: string;
  category: IssueCategory;
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

export interface AuditReport {
  score: number;
  summary: string;
  totalIssues: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  issues: SecurityIssue[];
  auditedFilesCount: number;
  providerUsed?: string;
  modelUsed?: string;
  failoverOccurred?: boolean;
  routingLogs?: ProviderAttemptLog[];
  timestamp: string;
}

export type SourceTab = "zip" | "url";
