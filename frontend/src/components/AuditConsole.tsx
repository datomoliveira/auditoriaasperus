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
  isPreparing: boolean;
  progressStage: string;
  fileInputRef: RefObject<HTMLInputElement>;
  folderInputRef: RefObject<HTMLInputElement>;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onFolderChange: (e: ChangeEvent<HTMLInputElement>) => void;
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
  isPreparing,
  progressStage,
  fileInputRef,
  folderInputRef,
  onFileChange,
  onFolderChange,
  onDragOver,
  onDragLeave,
  onDrop,
  onRepoUrlChange,
  onRun,
  onDemo,
}: AuditConsoleProps) {
  const busy = isAuditing || isPreparing;
  const canRun = !busy && (activeTab === "zip" ? !!selectedFile : !!repoUrl);

  const status = isPreparing
    ? "preparando a pasta"
    : isAuditing
      ? "analisando"
      : "pronto para começar";

  return (
    <div className="border border-rule-strong bg-ink-2/60">
      {/* cabeçalho do instrumento */}
      <div className="flex items-center justify-between border-b border-rule px-5 py-3">
        <span className="data-label">envio do projeto</span>
        <span className="data-label flex items-center gap-2">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              busy ? "bg-signal animate-pulse-soft" : "bg-bone-faint",
            )}
          />
          {status}
        </span>
      </div>

      <div className="p-5 sm:p-6">
        {/* seletor de fonte */}
        <div className="mb-6 flex items-center gap-6">
          {(
            [
              { id: "zip" as const, label: "Enviar do computador" },
              { id: "url" as const, label: "Link do projeto" },
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
          <div>
            {/* zona de arrastar e soltar — apenas soltar, não abre gerenciador */}
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={cn(
                "flex flex-col items-start border border-dashed px-6 py-9 transition-colors",
                isDragging
                  ? "border-signal bg-signal/[0.05]"
                  : "border-rule-strong",
              )}
            >
              {/* dois seletores: pasta inteira OU arquivo .zip */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                onChange={onFileChange}
                className="hidden"
              />
              <input
                ref={folderInputRef}
                type="file"
                onChange={onFolderChange}
                className="hidden"
                {...({ webkitdirectory: "true", directory: "true" } as Record<string, string>)}
              />

              {selectedFile ? (
                <>
                  <p className="text-[14px] text-bone">{selectedFile.name}</p>
                  <p className="data-label mt-2">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · pronto para analisar
                  </p>
                </>
              ) : isPreparing ? (
                <>
                  <p className="text-[14px] text-bone">Preparando a pasta…</p>
                  <p className="data-label mt-2">compactando os arquivos para o envio</p>
                </>
              ) : (
                <>
                  <p className="text-[14px] text-bone">
                    Arraste aqui a <span className="text-signal">pasta</span> do seu projeto ou um
                    arquivo <span className="text-signal">.zip</span>
                  </p>
                  <p className="data-label mt-2">ou use os botões abaixo · até 25 MB</p>
                </>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                disabled={busy}
                className="btn-line px-4 py-2.5 text-[12.5px] disabled:opacity-50"
              >
                Escolher pasta
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="btn-line px-4 py-2.5 text-[12.5px] disabled:opacity-50"
              >
                Escolher arquivo .zip
              </button>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-bone-faint">
              A pasta é enviada inteira, com os arquivos dentro — você não precisa compactar nada.
              Pastas pesadas como <code className="text-bone-dim">node_modules</code> são ignoradas.
            </p>
          </div>
        ) : (
          <div>
            <label htmlFor="repo-url" className="data-label">
              link do seu projeto
            </label>
            <input
              id="repo-url"
              type="text"
              spellCheck={false}
              placeholder="https://github.com/usuario/projeto  ou  https://site.com/projeto.zip"
              value={repoUrl}
              onChange={(e) => onRepoUrlChange(e.target.value)}
              className="mt-3 w-full border border-rule-strong bg-transparent px-3.5 py-3 font-mono text-[13px] text-bone placeholder:text-bone-faint focus:border-signal focus:outline-none"
            />
            <p className="mt-3 text-[12px] leading-relaxed text-bone-faint">
              Aceita um link de repositório (GitHub, GitLab…) ou um link direto para um arquivo{" "}
              <span className="text-bone-dim">.zip</span>. Baixamos uma cópia, analisamos e apagamos
              em seguida.
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
                {progressStage || "analisando"}
              </span>
            ) : isPreparing ? (
              "Preparando a pasta…"
            ) : (
              "Verificar meu projeto"
            )}
          </button>
          <button type="button" onClick={onDemo} className="data-label link-underline hover:text-bone">
            ver um exemplo de resultado
          </button>
        </div>
      </div>
    </div>
  );
}

export default AuditConsole;
