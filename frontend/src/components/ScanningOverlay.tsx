import { cn } from "../lib/cn";

const STAGES = [
  "Isolando repositório em sandbox",
  "Análise estática · OWASP Top 10",
  "Detecção de segredos e dependências",
  "Gerando patches de correção",
];

interface ScanningOverlayProps {
  stage: string;
}

function activeIndex(stage: string) {
  if (stage.includes("Isolando")) return 0;
  if (stage.includes("estática")) return 1;
  if (stage.includes("segredos")) return 2;
  if (stage.includes("patches")) return 3;
  return 0;
}

/**
 * Overlay de execução — mesmo mundo do dossiê: tela cheia, régua, mono para
 * dados. Sem vidro, sem card, sem anel de progresso decorativo.
 */
export function ScanningOverlay({ stage }: ScanningOverlayProps) {
  const active = activeIndex(stage);

  return (
    <div className="animate-fade fixed inset-0 z-[90] flex flex-col justify-between bg-ink px-6 py-8 sm:px-10 sm:py-10">
      <div className="flex items-start justify-between">
        <span className="data-label">Sentinel / auditoria em execução</span>
        <span className="data-label flex items-center gap-2">
          <span className="animate-pulse-soft h-1.5 w-1.5 rounded-full bg-signal" />
          processando
        </span>
      </div>

      <div className="max-w-3xl">
        <span className="data-label">etapa atual</span>
        <p className="display mt-3 text-[1.75rem] leading-tight text-bone sm:text-[2.25rem]">
          {stage || "inicializando"}
          <span className="animate-blink ml-1 text-signal">_</span>
        </p>

        <ol className="mt-10">
          {STAGES.map((s, i) => {
            const done = i < active;
            const current = i === active;
            return (
              <li
                key={s}
                className="rule flex items-center gap-4 py-3.5 first:border-t-0"
              >
                <span className="data-label tabular w-8 shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className={cn(
                    "text-[14px] transition-colors",
                    current && "text-bone",
                    done && "text-bone-faint line-through decoration-bone-faint/40",
                    !done && !current && "text-bone-faint",
                  )}
                >
                  {s}
                </span>
                <span className="data-label ml-auto shrink-0">
                  {done ? "ok" : current ? "ativo" : "na fila"}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex items-end justify-between gap-6">
        <span className="data-label max-w-md leading-relaxed">
          o código é isolado em sandbox descartável e descartado ao fim da varredura
        </span>
        <div className="relative hidden h-20 w-20 shrink-0 sm:block">
          <span className="absolute inset-0 rounded-full border border-rule" />
          <span className="absolute inset-3 rounded-full border border-rule" />
          <span className="animate-spin-slow absolute inset-0 rounded-full border-t border-signal" />
        </div>
      </div>
    </div>
  );
}

export default ScanningOverlay;
