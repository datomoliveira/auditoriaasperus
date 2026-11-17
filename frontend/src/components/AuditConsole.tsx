import type { ChangeEvent, DragEvent, RefObject } from "react";
import type { SourceTab } from "../types";
import { MarkAlert } from "./Marks";
import { cn } from "../lib/cn";

interface AuditConsoleProps {
  activeTab: SourceTab;
  onTabChange: (tab: SourceTab) => void;
  selectedFile: File | null;
  repoUrl: string;
  isDragging: boolean;
  errorMsg: string | null;
  isAuditing: boolean;
  progressStage: string;
  fileInputRef: RefObject<HTMLInputElement>;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => void;
  onRepoUrlChange: (value: string) => void;
  onRun: () => void;
  onDemo: () => void;
}

export function AuditConsole({
  activeTab,
  onTabChange,
  selectedFile,
  repoUrl,
  isDragging,
  errorMsg,
  isAuditing,
  progressStage,
  fileInputRef,
  onFileChange,
  onDragOver,
  onDragLeave,
  onDrop,
  onRepoUrlChange,
  onRun,
  onDemo,
}: AuditConsoleProps) {
  const canRun = !isAuditing && (activeTab === "zip" ? !!selectedFile : !!repoUrl);

  return (
    <div className="border border-rule-strong bg-ink-2/60">
      {/* cabeçalho do instrumento */}
      <div className="flex items-center justify-between border-b border-rule px-5 py-3">
        <span className="data-label">entrada / scan</span>
        <span className="data-label flex items-center gap-2">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              isAuditing ? "bg-signal animate-pulse-soft" : "bg-bone-faint",
            )}
          />
          {isAuditing ? "executando" : "aguardando"}
        </span>
      </div>

      <div className="p-5 sm:p-6">
        {/* seletor de fonte */}
        <div className="mb-6 flex items-center gap-6">
          {(
            [
              { id: "zip" as const, label: "Arquivo .zip" },
              { id: "url" as const, label: "Repositório git" },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              className={cn(
                "border-b pb-1.5 text-[13px] transition-colors",
                activeTab === id
                  ? "border-signal text-bone"
                  : "border-transparent text-bone-faint hover:text-bone-dim",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "zip" ? (
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
            }}
            role="button"
            tabIndex={0}
            className={cn(
              "flex cursor-pointer flex-col items-start border border-dashed px-6 py-10 transition-colors",
              isDragging
                ? "border-signal bg-signal/[0.05]"
                : "border-rule-strong hover:border-bone-dim",
            )}
          >
            <input ref={fileInputRef} type="file" accept=".zip" onChange={onFileChange} className="hidden" />
            <p className="text-[14px] text-bone">
              {selectedFile ? selectedFile.name : "Arraste o .zip do projeto aqui"}
            </p>
            <p className="data-label mt-2">
              {selectedFile
                ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · pronto para varredura`
                : "ou clique para selecionar · até 25 MB"}
            </p>
          </div>
        ) : (
          <div>
            <label htmlFor="repo-url" className="data-label">
              url pública do repositório
            </label>
            <input
              id="repo-url"
              type="url"
              spellCheck={false}
              placeholder="https://github.com/empresa/repositorio"
              value={repoUrl}
              onChange={(e) => onRepoUrlChange(e.target.value)}
              className="mt-3 w-full border border-rule-strong bg-transparent px-3.5 py-3 font-mono text-[13px] text-bone placeholder:text-bone-faint focus:border-signal focus:outline-none"
            />
            <p className="mt-3 text-[12px] leading-relaxed text-bone-faint">
              Clonagem rasa em sandbox isolada, descartada após a auditoria.
            </p>
          </div>
        )}

        {errorMsg && (
          <div className="mt-5 flex items-start gap-3 border border-sev-critical/40 px-4 py-3">
            <MarkAlert className="mt-0.5 h-4 w-4 shrink-0 text-sev-critical" />
            <span className="text-[12.5px] leading-relaxed text-bone-dim">{errorMsg}</span>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <button
            type="button"
            disabled={!canRun}
            onClick={onRun}
            className="btn-solid px-6 py-3 text-[13px]"
          >
            {isAuditing ? (
              <span className="flex items-center gap-2.5">
                <span className="inline-block h-3.5 w-3.5 animate-spin border border-current border-b-transparent border-l-transparent" />
                {progressStage || "processando"}
              </span>
            ) : (
              "Executar auditoria"
            )}
          </button>
          <button type="button" onClick={onDemo} className="data-label link-underline hover:text-bone">
            ver demonstração
          </button>
        </div>
      </div>
    </div>
  );
}

export default AuditConsole;
